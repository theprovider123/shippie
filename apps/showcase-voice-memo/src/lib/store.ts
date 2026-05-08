/**
 * Local-only persistence for voice memos.
 *
 * Audio blobs live in IndexedDB (ObjectStore: blobs). Metadata —
 * id, transcript, tags, duration — lives in localStorage as a JSON
 * array. Same pattern as Restaurant Memory's photos.
 *
 * Why not OPFS via @shippie/local-files? OPFS works on the platform
 * but has quirks under iOS Safari that we don't need to take on for
 * a demo this size. IndexedDB blob support is universal.
 *
 * Why not @shippie/local-db (wa-sqlite)? Overkill for a flat memo
 * list. The transcript is plain text — substring + token search
 * lives in `search.ts` and runs on a few hundred rows in <2 ms.
 */

import { tokenize } from './search.ts';

const STORAGE_KEY = 'shippie.voice-memo.v1';
const SETTINGS_KEY = 'shippie.voice-memo.settings.v1';
const DB_NAME = 'shippie.voice-memo';
const BLOB_STORE = 'blobs';

export interface Memo {
  id: string;
  /** "First five words of the transcript" — overrideable. */
  title: string;
  transcript: string;
  /** Whisper segment timestamps for scrub-to-word. */
  segments: { start: number; end: number; text: string }[];
  /** Whisper-tiny is decent on clean English. We surface the language
   * the user selected at recording time so the UI can warn appropriately. */
  language: string;
  duration_s: number;
  tags: string[];
  /** Set true once the user manually changes the transcript. */
  edited: boolean;
  /** Audio mime extension — used when offering Save / Share. */
  audio_ext: string;
  recorded_at: string;
}

export interface Settings {
  language: string;
  /** Recording cap in ms. Clamped on read. */
  max_duration_ms: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  max_duration_ms: 60_000,
};

interface Persisted {
  memos: Memo[];
}

export function newId(prefix = 'memo'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadMemos(storage: Storage = localStorage): Memo[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return Array.isArray(parsed.memos) ? parsed.memos : [];
  } catch {
    return [];
  }
}

export function saveMemos(memos: Memo[], storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ memos } satisfies Persisted));
  } catch {
    /* best-effort */
  }
}

export function loadSettings(storage: Storage = localStorage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      language:
        typeof parsed.language === 'string' && parsed.language.length > 0
          ? parsed.language
          : DEFAULT_SETTINGS.language,
      max_duration_ms:
        typeof parsed.max_duration_ms === 'number' && Number.isFinite(parsed.max_duration_ms)
          ? parsed.max_duration_ms
          : DEFAULT_SETTINGS.max_duration_ms,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: Storage = localStorage): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* best-effort */
  }
}

export function insertMemo(memos: Memo[], memo: Memo): Memo[] {
  // Newest first; cap at 500 to keep localStorage reasonable.
  return [memo, ...memos.filter((m) => m.id !== memo.id)].slice(0, 500);
}

export function updateMemo(memos: Memo[], id: string, patch: Partial<Memo>): Memo[] {
  return memos.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

export function deleteMemo(memos: Memo[], id: string): Memo[] {
  return memos.filter((m) => m.id !== id);
}

export function getMemo(memos: Memo[], id: string): Memo | null {
  return memos.find((m) => m.id === id) ?? null;
}

/** Lookup by tag (case-insensitive). */
export function memosWithTag(memos: Memo[], tag: string): Memo[] {
  const needle = tag.trim().toLowerCase();
  if (!needle) return [];
  return memos.filter((m) => m.tags.some((t) => t.toLowerCase() === needle));
}

/** Distinct tags across the library, sorted by usage desc. */
export function tagsSummary(memos: Memo[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const memo of memos) {
    for (const tag of memo.tags) {
      const norm = tag.trim().toLowerCase();
      if (!norm) continue;
      counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
}

/** Same tokenizer as search, surfaced for unit-tests of the indexer. */
export const indexerTokenize = tokenize;

// ---------------------------------------------------------------------------
// IndexedDB blob storage
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.objectStore(BLOB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
  });
  db.close();
}

export async function loadAudioBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as Blob | undefined) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('IndexedDB get failed'));
    };
  });
}

export async function deleteAudioBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.objectStore(BLOB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

export async function clearAllBlobs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.objectStore(BLOB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
  });
  db.close();
}
