/**
 * IndexedDB-backed usage log.
 *
 * Stores one row per inference request — origin, task, ts, durationMs.
 * Inputs and results are NEVER stored; if you find yourself reaching for
 * `result` here, stop. The privacy footer on the dashboard ("All processing
 * runs on this device. No inference logs of input or output.") is load-
 * bearing and depends on this.
 *
 * The store is bounded — we cap at LOG_CAP rows and trim oldest on insert,
 * so long-running devices don't bloat OPFS.
 */
import type { UsageEntry } from '../types.ts';

const DB_NAME = 'shippie-ai';
const DB_VERSION = 1;
const STORE = 'usage';
const LOG_CAP = 5_000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byTs', 'ts');
        store.createIndex('byOrigin', 'origin');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
  return dbPromise;
}

export async function logUsage(entry: UsageEntry): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('add failed'));
  });
  // Cheap cap enforcement — every ~100 inserts, prune.
  if (Math.random() < 0.01) await prune().catch(() => {});
}

export async function listUsage(): Promise<UsageEntry[]> {
  const db = await openDb();
  return new Promise<UsageEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as UsageEntry[]);
    req.onerror = () => reject(req.error ?? new Error('getAll failed'));
  });
}

export async function clearUsage(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
  });
}

async function prune(): Promise<void> {
  const all = await listUsage();
  if (all.length <= LOG_CAP) return;
  const drop = all.length - LOG_CAP;
  const db = await openDb();
  const sorted = all.slice().sort((a, b) => a.ts - b.ts);
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (let i = 0; i < drop; i++) {
    const id = (sorted[i] as unknown as { id?: number }).id;
    if (typeof id === 'number') store.delete(id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('prune failed'));
  });
}

export interface UsageRollup {
  origin: string;
  count: number;
}

export function rollupByOrigin(entries: UsageEntry[]): UsageRollup[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.origin, (counts.get(e.origin) ?? 0) + 1);
  return Array.from(counts, ([origin, count]) => ({ origin, count })).sort(
    (a, b) => b.count - a.count,
  );
}
