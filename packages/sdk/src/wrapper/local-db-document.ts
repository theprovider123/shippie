import {
  canonicalize,
  createIndexedDbDocumentStore,
  createLocalStorageDocumentStore,
  createSealedSyncClient,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  type DocumentEvent,
} from '@shippie/doc';

export interface LocalDbLike {
  create(table: string, schema: unknown): Promise<void>;
  query(table: string, opts?: Record<string, unknown>): Promise<unknown[]>;
}

export interface LocalDbDocumentTable {
  name: string;
  schema: unknown;
}

export interface LocalDbDocumentMigrationOptions {
  appSlug: string;
  documentId?: string;
  namespace?: string;
  tables: LocalDbDocumentTable[];
  sync?: boolean;
}

export interface LocalDbSnapshotState {
  tables: Record<string, unknown[]>;
  migratedAt?: string;
}

interface LocalDbSnapshotPayload {
  type: 'local-db-snapshot';
  tables: Record<string, unknown[]>;
  source: 'local-db';
}

export async function migrateLocalDbTablesToDocument(
  db: LocalDbLike,
  opts: LocalDbDocumentMigrationOptions,
): Promise<{ migrated: boolean; documentId: string; rowCount: number }> {
  if (!hasBrowserStorage()) {
    return { migrated: false, documentId: opts.documentId ?? `doc_${normaliseToken(opts.appSlug)}_local_db`, rowCount: 0 };
  }

  const namespace = opts.namespace ?? `shippie.${normaliseToken(opts.appSlug)}.doc.v1`;
  const documentId = opts.documentId ?? readOrCreateDocumentId(`${namespace}:document-id`, opts.appSlug);
  const tables: Record<string, unknown[]> = {};

  for (const table of opts.tables) {
    await db.create(table.name, table.schema);
    tables[table.name] = await db.query(table.name);
  }

  const rowCount = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
  const stamp = await snapshotStamp(tables);
  const stampKey = `${namespace}:${documentId}:migrated`;
  if (localStorage.getItem(stampKey) === stamp) {
    return { migrated: false, documentId, rowCount };
  }

  const documentKey = readOrCreateDocumentKey(`${namespace}:key`);
  const signing = await generateDeviceSigningKeyPair();
  const store = createBrowserDocumentStore(namespace);
  const sync = (opts.sync ?? shouldAttemptSealedSync()) ? createSealedSyncClient() : undefined;
  const document = await openDocument<LocalDbSnapshotState, LocalDbSnapshotPayload>({
    documentId,
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
    initialState: { tables: {} },
    reducer: reduceLocalDbSnapshot,
  });

  await document.append({
    kind: 'local-db.snapshot',
    payload: { type: 'local-db-snapshot', tables, source: 'local-db' },
    eventId: `snapshot_${stamp}`,
  });
  try {
    await document.sync();
  } catch {
    // Local copy is already stronger; sealed cloud retries on the next migration pass.
  }

  const rebuiltCount = Object.values(document.state().tables).reduce((sum, rows) => sum + rows.length, 0);
  if (rebuiltCount >= rowCount) localStorage.setItem(stampKey, stamp);
  return { migrated: true, documentId, rowCount };
}

export function reduceLocalDbSnapshot(
  state: LocalDbSnapshotState,
  event: DocumentEvent<LocalDbSnapshotPayload>,
): LocalDbSnapshotState {
  if (event.payload.type !== 'local-db-snapshot') return state;
  return {
    tables: event.payload.tables,
    migratedAt: event.createdAt,
  };
}

function readOrCreateDocumentKey(storageKey: string): string {
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = generateDocumentKey();
  localStorage.setItem(storageKey, next);
  return next;
}

function readOrCreateDocumentId(storageKey: string, appSlug: string): string {
  const existing = localStorage.getItem(storageKey);
  if (existing && !isLegacySharedDocumentId(existing, appSlug)) return existing;
  const next = `doc_${normaliseToken(appSlug).slice(0, 48)}_${randomBase64Url(24)}`;
  localStorage.setItem(storageKey, next);
  return next;
}

async function snapshotStamp(tables: Record<string, unknown[]>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(tables));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 32);
}

function normaliseToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 96) || 'app';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function isLegacySharedDocumentId(documentId: string, appSlug: string): boolean {
  return documentId === `${normaliseToken(appSlug)}_local_db_v1`;
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
