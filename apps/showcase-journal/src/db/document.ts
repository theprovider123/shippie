import {
  canonicalize,
  createIndexedDbDocumentStore,
  createLocalStorageDocumentStore,
  createSealedSyncClient,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  type DocumentEvent,
  type DocumentHandle,
} from '@shippie/doc';
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import { ENTRIES_TABLE, entriesSchema, type JournalEntry } from './schema.ts';

const JOURNAL_DOCUMENT_ID = 'journal_entries_v1';
const KEY_STORAGE = 'shippie.journal.doc.v1.key';
const MIGRATION_STORAGE = 'shippie.journal.doc.v1.migrated';

type SerializableJournalEntry = Omit<JournalEntry, 'embedding'> & {
  embedding?: number[] | null;
};

export type JournalDocumentPayload =
  | { type: 'entry-upsert'; entry: SerializableJournalEntry }
  | { type: 'entry-delete'; id: string }
  | { type: 'legacy-snapshot'; entries: SerializableJournalEntry[]; source: 'local-db' };

export interface JournalDocumentState {
  entries: Record<string, SerializableJournalEntry>;
  deletedIds: string[];
  legacySnapshotAt?: string;
}

let handlePromise: Promise<DocumentHandle<JournalDocumentState, JournalDocumentPayload>> | null = null;

export function reduceJournalDocument(
  state: JournalDocumentState,
  event: DocumentEvent<JournalDocumentPayload>,
): JournalDocumentState {
  const payload = event.payload;
  if (payload.type === 'legacy-snapshot') {
    const entries = { ...state.entries };
    for (const entry of payload.entries) {
      if (!state.deletedIds.includes(entry.id)) entries[entry.id] = entry;
    }
    return { ...state, entries, legacySnapshotAt: event.createdAt };
  }
  if (payload.type === 'entry-upsert') {
    const entries = { ...state.entries, [payload.entry.id]: payload.entry };
    return {
      ...state,
      entries,
      deletedIds: state.deletedIds.filter((id) => id !== payload.entry.id),
    };
  }
  if (payload.type === 'entry-delete') {
    const entries = { ...state.entries };
    delete entries[payload.id];
    return {
      ...state,
      entries,
      deletedIds: state.deletedIds.includes(payload.id)
        ? state.deletedIds
        : [...state.deletedIds, payload.id],
    };
  }
  return state;
}

export async function migrateJournalEntriesToDocument(db: ShippieLocalDb): Promise<void> {
  if (!hasBrowserStorage()) return;
  await db.create(ENTRIES_TABLE, entriesSchema);
  const entries = await db.query<JournalEntry & LocalDbRecord>(ENTRIES_TABLE, { orderBy: { created_at: 'desc' } });
  const stamp = await migrationStamp(entries);
  if (localStorage.getItem(MIGRATION_STORAGE) === stamp) return;

  const document = await openJournalDocument();
  const serialised = entries.map(serialiseEntry);
  await document.append({
    kind: 'journal.legacy-snapshot',
    payload: { type: 'legacy-snapshot', entries: serialised, source: 'local-db' },
    eventId: `journal_snapshot_${stamp}`,
  });
  await safeSync(document);

  const migratedCount = Object.keys(document.state().entries).length;
  if (migratedCount >= serialised.length) localStorage.setItem(MIGRATION_STORAGE, stamp);
}

export async function rememberJournalEntryUpsert(entry: JournalEntry): Promise<void> {
  if (!hasBrowserStorage()) return;
  const document = await openJournalDocument();
  await document.append({
    kind: 'journal.entry-upsert',
    payload: { type: 'entry-upsert', entry: serialiseEntry(entry) },
  });
}

export async function rememberJournalEntryDelete(id: string): Promise<void> {
  if (!hasBrowserStorage()) return;
  const document = await openJournalDocument();
  await document.append({
    kind: 'journal.entry-delete',
    payload: { type: 'entry-delete', id },
  });
}

async function openJournalDocument(): Promise<DocumentHandle<JournalDocumentState, JournalDocumentPayload>> {
  if (handlePromise) return handlePromise;
  handlePromise = (async () => {
    const documentKey = readOrCreateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createBrowserDocumentStore('shippie.journal.doc.v1');
    const sync = shouldAttemptSealedSync() ? createSealedSyncClient() : undefined;
    return openDocument<JournalDocumentState, JournalDocumentPayload>({
      documentId: JOURNAL_DOCUMENT_ID,
      documentKey,
      signing,
      store,
      sync,
      realtime: sync
        ? {
            pushDebounceMs: 80,
            pullIntervalMs: 1_000,
            idlePullIntervalMs: 15_000,
            maxBackoffMs: 30_000,
          }
        : false,
      initialState: { entries: {}, deletedIds: [] },
      reducer: reduceJournalDocument,
    });
  })();
  return handlePromise;
}

function readOrCreateDocumentKey(): string {
  const existing = localStorage.getItem(KEY_STORAGE);
  if (existing) return existing;
  const next = generateDocumentKey();
  localStorage.setItem(KEY_STORAGE, next);
  return next;
}

function serialiseEntry(entry: JournalEntry): SerializableJournalEntry {
  const embedding = entry.embedding as unknown;
  return {
    ...entry,
    embedding: embedding instanceof Float32Array
      ? Array.from(embedding)
      : Array.isArray(embedding)
        ? embedding.map(Number)
        : null,
  };
}

async function migrationStamp(entries: JournalEntry[]): Promise<string> {
  const text = canonicalize(entries.map(serialiseEntry));
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 32);
}

async function safeSync(document: DocumentHandle<JournalDocumentState, JournalDocumentPayload>): Promise<void> {
  try {
    await document.sync();
  } catch (err) {
    console.debug('shippie:journal sealed copy will retry later', err);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

function shouldAttemptSealedSync(): boolean {
  if (typeof location === 'undefined') return false;
  if (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    location.port &&
    location.port !== '4101' &&
    location.port !== '8788'
  ) {
    return false;
  }
  return true;
}

function createBrowserDocumentStore(namespace: string) {
  try {
    if (typeof indexedDB !== 'undefined') return createIndexedDbDocumentStore({ namespace });
  } catch {
    // Fall through to localStorage for older/private browser contexts.
  }
  return createLocalStorageDocumentStore({ namespace });
}
