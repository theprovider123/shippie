const DB_NAME = 'shippie-matchday';
const STORE_NAME = 'queued-messages';
const DB_VERSION = 1;

export interface QueuedMessage<T = unknown> {
  id: string;
  payload: T;
  createdAt: number;
}

export interface VoteQueue<T = unknown> {
  add(message: QueuedMessage<T>): Promise<void>;
  all(): Promise<Array<QueuedMessage<T>>>;
  remove(id: string): Promise<void>;
  drain(send: (message: QueuedMessage<T>) => Promise<boolean>): Promise<number>;
}

export function createMemoryVoteQueue<T = unknown>(): VoteQueue<T> {
  const messages = new Map<string, QueuedMessage<T>>();
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

export function createIndexedDbVoteQueue<T = unknown>(): VoteQueue<T> {
  if (typeof indexedDB === 'undefined') return createMemoryVoteQueue<T>();

  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'));
    });

  const txStore = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => {
    const db = await openDb();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  };

  return {
    async add(message) {
      const store = await txStore('readwrite');
      await requestDone(store.put(message));
    },
    async all() {
      const store = await txStore('readonly');
      const result = await requestDone<Array<QueuedMessage<T>>>(store.getAll());
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
