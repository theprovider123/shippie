/**
 * IndexedDB storage layer for the intelligence package.
 *
 * Four object stores in the `shippie-intelligence` database:
 *   - `pageviews`     — auto-incrementing key, indexed by `ts`. Capped at LOG_CAP.
 *   - `interactions`  — auto-incrementing key, indexed by `ts`.
 *   - `embeddings`    — keyed by viewId (number), value is a Float32Array.
 *   - `spaces`        — keyed by SHA-256 fingerprint id (string). Spatial-memory
 *                       observations (see spatial-memory.ts). Added in v2.
 *
 * Pruning of `pageviews` happens probabilistically on each append (1% per
 * insert) so we never have to walk the whole store on every write. Oldest
 * entries (lowest `ts`) are dropped first.
 *
 * Mirrors the open-once + close-on-reset pattern in
 * packages/sdk/src/wrapper/patina/storage.ts.
 */
import type { InteractionEvent, PageView } from './types.ts';

const DB_NAME = 'shippie-intelligence';
const DB_VERSION = 2;

const PAGEVIEWS = 'pageviews';
const INTERACTIONS = 'interactions';
const EMBEDDINGS = 'embeddings';
const SPACES = 'spaces';

export const LOG_CAP = 10_000;
const PRUNE_PROBABILITY = 0.01;

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedDb: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGEVIEWS)) {
        const store = db.createObjectStore(PAGEVIEWS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains(INTERACTIONS)) {
        const store = db.createObjectStore(INTERACTIONS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains(EMBEDDINGS)) {
        // viewId is an in-line key path so we can put({ viewId, vec }).
        db.createObjectStore(EMBEDDINGS, { keyPath: 'viewId' });
      }
      if (!db.objectStoreNames.contains(SPACES)) {
        // id is the SHA-256 fingerprint hex string.
        db.createObjectStore(SPACES, { keyPath: 'id' });
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

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function appendPageView(
  view: Omit<PageView, 'id'> & { id?: number },
): Promise<number> {
  const db = await openDb();
  const id = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(PAGEVIEWS, 'readwrite');
    const req = tx.objectStore(PAGEVIEWS).add(view);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
  if (Math.random() < PRUNE_PROBABILITY) {
    await pruneOldest(db).catch(() => {
      // Pruning is best-effort; never throw to caller.
    });
  }
  return id;
}

async function pruneOldest(db: IDBDatabase): Promise<void> {
  const count = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(PAGEVIEWS, 'readonly');
    const req = tx.objectStore(PAGEVIEWS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (count <= LOG_CAP) return;
  const toDrop = count - LOG_CAP;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PAGEVIEWS, 'readwrite');
    const store = tx.objectStore(PAGEVIEWS);
    const index = store.index('ts');
    let dropped = 0;
    const req = index.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || dropped >= toDrop) return;
      cursor.delete();
      dropped += 1;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function appendInteraction(event: InteractionEvent): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INTERACTIONS, 'readwrite');
    const req = tx.objectStore(INTERACTIONS).add(event);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPageViews(opts: {
  since?: number;
  limit?: number;
}): Promise<Array<PageView & { id: number }>> {
  const db = await openDb();
  const since = opts.since;
  const limit = opts.limit;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGEVIEWS, 'readonly');
    const store = tx.objectStore(PAGEVIEWS);
    const index = store.index('ts');
    const range = since !== undefined ? IDBKeyRange.lowerBound(since) : null;
    const results: Array<PageView & { id: number }> = [];
    const req = range ? index.openCursor(range) : index.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      results.push(cursor.value as PageView & { id: number });
      if (limit !== undefined && results.length >= limit) return;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(results);
    tx.onerror = () => reject(tx.error);
  });
}

export async function appendEmbedding(viewId: number, vec: Float32Array): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(EMBEDDINGS, 'readwrite');
    const req = tx.objectStore(EMBEDDINGS).put({ viewId, vec });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getEmbedding(viewId: number): Promise<Float32Array | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EMBEDDINGS, 'readonly');
    const req = tx.objectStore(EMBEDDINGS).get(viewId);
    req.onsuccess = () => {
      const row = req.result as { viewId: number; vec: Float32Array } | undefined;
      if (!row) {
        resolve(null);
        return;
      }
      // fake-indexeddb may round-trip Float32Array as a plain object copy; we
      // re-wrap defensively so consumers always get a real Float32Array view.
      const vec = row.vec;
      if (vec instanceof Float32Array) {
        resolve(vec);
      } else if (ArrayBuffer.isView(vec)) {
        resolve(new Float32Array((vec as ArrayBufferView).buffer.slice(0)));
      } else {
        resolve(new Float32Array(vec as ArrayLike<number>));
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Minimal structural shape for stored space records — kept here to avoid a
 * circular import between storage.ts and spatial-memory.ts. The full
 * `SpaceFingerprint` interface (which extends this shape) lives in
 * spatial-memory.ts.
 */
interface StoredSpace {
  id: string;
  source: 'wifi' | 'geo' | 'unavailable';
  label: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  observations: number;
}

/**
 * Upsert a space observation. If the row exists, increments `observations`
 * and updates `lastSeenAt`; preserves the existing `label` and `firstSeenAt`.
 * If absent, inserts a fresh row with observations=1.
 *
 * Returns the row that is now in the store.
 */
export async function upsertSpace(
  fingerprint: { id: string },
  source: 'wifi' | 'geo' | 'unavailable',
  now: number,
): Promise<StoredSpace> {
  const db = await openDb();
  return new Promise<StoredSpace>((resolve, reject) => {
    const tx = db.transaction(SPACES, 'readwrite');
    const store = tx.objectStore(SPACES);
    const getReq = store.get(fingerprint.id);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredSpace | undefined;
      const next: StoredSpace = existing
        ? {
            id: existing.id,
            // Preserve original source on subsequent observations — diagnostic
            // value is "what did we use the first time?". Keeps id stability
            // semantics intact even if a later call resolves via a different
            // fallback path.
            source: existing.source,
            label: existing.label,
            firstSeenAt: existing.firstSeenAt,
            lastSeenAt: now,
            observations: existing.observations + 1,
          }
        : {
            id: fingerprint.id,
            source,
            label: null,
            firstSeenAt: now,
            lastSeenAt: now,
            observations: 1,
          };
      const putReq = store.put(next);
      putReq.onsuccess = () => resolve(next);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Sets the user-visible label on a space. No-op if the space hasn't been
 * observed yet (we don't create stub rows).
 */
export async function setSpaceLabelStored(id: string, label: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SPACES, 'readwrite');
    const store = tx.objectStore(SPACES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredSpace | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const updated: StoredSpace = { ...existing, label };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Reads a space row by id, or returns null if absent.
 */
export async function getSpace(id: string): Promise<StoredSpace | null> {
  const db = await openDb();
  return new Promise<StoredSpace | null>((resolve, reject) => {
    const tx = db.transaction(SPACES, 'readonly');
    const req = tx.objectStore(SPACES).get(id);
    req.onsuccess = () => {
      const row = req.result as StoredSpace | undefined;
      resolve(row ?? null);
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _resetIntelligenceDbForTest(): Promise<void> {
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

// Internal accessor used only by tests to assert the cache is cleared after
// reset. Exported under an underscore-prefixed name to signal "do not use".
export function _peekCachedDbForTest(): IDBDatabase | null {
  return cachedDb;
}
