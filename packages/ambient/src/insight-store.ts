/**
 * IndexedDB-backed insight store for the ambient package.
 *
 * One database (`shippie-ambient`, version 1) hosts both stores used by
 * ambient intelligence:
 *  - `insights`: key = insight.id, holds the rendered + dismissed state.
 *  - `queue`: auto-incrementing key, holds AI-pending analysis requests
 *    (drained by `queue.ts` when a tab is open).
 *
 * Both modules share a single open-once / close-on-reset connection,
 * mirroring the pattern used in `packages/sdk/src/wrapper/patina/storage.ts`.
 */
import type { Insight } from './types.ts';

export const DB_NAME = 'shippie-ambient';
export const DB_VERSION = 1;
export const INSIGHTS_STORE = 'insights';
export const QUEUE_STORE = 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedDb: IDBDatabase | null = null;

export function _openAmbientDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INSIGHTS_STORE)) {
        db.createObjectStore(INSIGHTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      cachedDb = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function _closeAmbientDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  dbPromise = null;
}

async function _deleteAmbientDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function appendInsight(insight: Insight): Promise<void> {
  const db = await _openAmbientDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INSIGHTS_STORE, 'readwrite');
    const req = tx.objectStore(INSIGHTS_STORE).put(insight);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listUndismissed(opts?: { collection?: string }): Promise<Insight[]> {
  const db = await _openAmbientDb();
  const all = await new Promise<Insight[]>((resolve, reject) => {
    const tx = db.transaction(INSIGHTS_STORE, 'readonly');
    const req = tx.objectStore(INSIGHTS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as Insight[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
  return all.filter((i) => {
    if (i.dismissed) return false;
    if (opts?.collection && i.collection !== opts.collection) return false;
    return true;
  });
}

async function _patchInsight(id: string, patch: Partial<Insight>): Promise<void> {
  const db = await _openAmbientDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INSIGHTS_STORE, 'readwrite');
    const store = tx.objectStore(INSIGHTS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as Insight | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const next: Insight = { ...existing, ...patch };
      const putReq = store.put(next);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function markShown(id: string): Promise<void> {
  await _patchInsight(id, { shown: true });
}

export async function dismiss(id: string): Promise<void> {
  await _patchInsight(id, { dismissed: true });
}

export async function _resetInsightStoreForTest(): Promise<void> {
  _closeAmbientDb();
  await _deleteAmbientDb();
}
