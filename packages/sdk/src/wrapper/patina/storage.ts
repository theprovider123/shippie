/**
 * Patina state in IndexedDB. One record per origin, keyed by 'state'.
 *
 * IndexedDB is intentionally chosen over localStorage so the read/write
 * doesn't block the main thread. Writes are fire-and-forget — patina is
 * cosmetic, not load-bearing, so transient failures are fine.
 */
import type { PatinaState } from './types.ts';

const DB_NAME = 'shippie-patina';
const STORE = 'state';
const KEY = 'state';

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedDb: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      cachedDb = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function loadPatinaState(): Promise<PatinaState | null> {
  try {
    const db = await openDb();
    return await new Promise<PatinaState | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PatinaState | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function savePatinaState(state: PatinaState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(state, KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Patina is cosmetic — never throw.
  }
}

export async function _resetPatinaDbForTest(): Promise<void> {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  dbPromise = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
