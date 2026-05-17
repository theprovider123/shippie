import type { EventQueue, QueuedEvent } from './types.ts';

const DEFAULT_DB_NAME = 'shippie-spaces';
const DEFAULT_STORE_NAME = 'queued-events';
const DB_VERSION = 1;

export function createMemoryEventQueue<TPayload = unknown>(): EventQueue<TPayload> {
  const messages = new Map<string, QueuedEvent<TPayload>>();
  return {
    async add(message) {
      messages.set(message.id, message);
    },
    async all() {
      return [...messages.values()].sort((a, b) => a.createdAt - b.createdAt);
    },
    async remove(id) {
      messages.delete(id);
    },
    async drain(send) {
      let count = 0;
      for (const message of await this.all()) {
        if (await send(message)) {
          messages.delete(message.id);
          count += 1;
        }
      }
      return count;
    },
  };
}

export function createIndexedDbEventQueue<TPayload = unknown>(opts: { dbName?: string; storeName?: string } = {}): EventQueue<TPayload> {
  if (typeof indexedDB === 'undefined') return createMemoryEventQueue<TPayload>();
  const dbName = opts.dbName ?? DEFAULT_DB_NAME;
  const storeName = opts.storeName ?? DEFAULT_STORE_NAME;

  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'));
    });

  const txStore = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => {
    const db = await openDb();
    return db.transaction(storeName, mode).objectStore(storeName);
  };

  return {
    async add(message) {
      const store = await txStore('readwrite');
      await requestDone(store.put(message));
    },
    async all() {
      const store = await txStore('readonly');
      const result = await requestDone<Array<QueuedEvent<TPayload>>>(store.getAll());
      return result.sort((a, b) => a.createdAt - b.createdAt);
    },
    async remove(id) {
      const store = await txStore('readwrite');
      await requestDone(store.delete(id));
    },
    async drain(send) {
      let count = 0;
      for (const message of await this.all()) {
        if (await send(message)) {
          await this.remove(message.id);
          count += 1;
        }
      }
      return count;
    },
  };
}

function requestDone<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

