import type { OutboxEntry, OutboxStore } from '@shippie/cloudlet-contract';

/**
 * IndexedDB-backed {@link OutboxStore} — the browser binding for the Outbox.
 * Deliberately tiny (no `idb` dependency): one object store for queued events,
 * one for scalar meta (the per-device id). All access is promise-wrapped.
 *
 * This file is NOT unit-tested in Node (IndexedDB is browser-only); the pure
 * queue/replay logic is tested via the fake store in `outbox.test.ts`. This is
 * the thin, hard-to-test-in-Node edge by design.
 */

const DB_NAME = 'shippie-uniti-outbox';
const DB_VERSION = 1;
const EVENTS = 'events';
const META = 'meta';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const r = fn(t);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function createIdbOutboxStore(): OutboxStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());

  return {
    async get(key) {
      return tx<OutboxEntry | undefined>(await db(), [EVENTS], 'readonly', (t) =>
        t.objectStore(EVENTS).get(key),
      );
    },
    async put(key, value) {
      await tx(await db(), [EVENTS], 'readwrite', (t) => t.objectStore(EVENTS).put(value, key));
    },
    async delete(key) {
      await tx(await db(), [EVENTS], 'readwrite', (t) => t.objectStore(EVENTS).delete(key));
    },
    async list() {
      const conn = await db();
      const [keys, values] = await Promise.all([
        tx<IDBValidKey[]>(conn, [EVENTS], 'readonly', (t) => t.objectStore(EVENTS).getAllKeys()),
        tx<OutboxEntry[]>(conn, [EVENTS], 'readonly', (t) => t.objectStore(EVENTS).getAll()),
      ]);
      return keys
        .map((key, i) => ({ key: String(key), value: values[i] }))
        .sort((a, b) => a.value.enqueuedAt - b.value.enqueuedAt);
    },
    async getMeta(key) {
      const v = await tx<string | undefined>(await db(), [META], 'readonly', (t) =>
        t.objectStore(META).get(key),
      );
      return v;
    },
    async setMeta(key, value) {
      await tx(await db(), [META], 'readwrite', (t) => t.objectStore(META).put(value, key));
    },
  };
}
