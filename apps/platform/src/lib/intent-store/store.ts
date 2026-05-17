/**
 * Cross-app intent event store.
 *
 * Persists every `intent.provide` broadcast that flows through the
 * container's bridge so the platform-side `/today` surface can render a
 * cross-app summary without each app rolling its own aggregator.
 *
 * Privacy invariant — load-bearing:
 *   The events live in IndexedDB on the user's device. They are never
 *   posted to a Shippie server. The platform host is the aggregator;
 *   there is no aggregator anywhere else. This is the one part of the
 *   privacy story that has to be true structurally for the cross-app
 *   graph to be honest.
 *
 * Capacity:
 *   Window = 30 days rolling. Cap at 5_000 events to bound IndexedDB
 *   growth on heavy users. On record(), prune anything older than the
 *   window OR over the cap (oldest first).
 */

const DB_NAME = 'shippie-intent-store';
const STORE = 'events';
const VERSION = 1;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_EVENTS = 5_000;

export interface IntentEvent {
  /** Auto-incrementing primary key. */
  id?: number;
  /** Wall-clock ms when the broadcast happened. */
  ts: number;
  /** Source app — `appId` slug from the registry. */
  appId: string;
  /** Intent name — e.g. `coffee-brewed`, `cycle-logged`. */
  intent: string;
  /** Optional row payload as published by the provider. JSON-friendly. */
  row: unknown;
}

let openPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable in this context'));
  }
  if (openPromise) return openPromise;
  openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('ts', 'ts');
        os.createIndex('intent', 'intent');
        os.createIndex('appId', 'appId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return openPromise;
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/**
 * Record one or more rows for a single (appId, intent) broadcast.
 * Best-effort: throws are swallowed by the caller. The cross-app graph
 * is observability, not consistency-critical.
 */
export async function recordIntents(
  appId: string,
  intent: string,
  rows: readonly unknown[],
): Promise<void> {
  if (!appId || !intent || rows.length === 0) return;
  const db = await openDb();
  const ts = Date.now();
  await new Promise<void>((resolve, reject) => {
    const store = txStore(db, 'readwrite');
    for (const row of rows) {
      store.add({ ts, appId, intent, row } satisfies IntentEvent);
    }
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
  // Prune lazily — we don't await it on the broadcast path.
  void prune();
}

async function prune(): Promise<void> {
  const db = await openDb().catch(() => null);
  if (!db) return;
  const cutoff = Date.now() - WINDOW_MS;
  await new Promise<void>((resolve) => {
    const store = txStore(db, 'readwrite');
    const idx = store.index('ts');
    const range = IDBKeyRange.upperBound(cutoff, true);
    const req = idx.openCursor(range);
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        cur.delete();
        cur.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => resolve();
  });
  // Cap by count.
  await new Promise<void>((resolve) => {
    const store = txStore(db, 'readwrite');
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total <= MAX_EVENTS) {
        resolve();
        return;
      }
      const dropN = total - MAX_EVENTS;
      let dropped = 0;
      const idx = store.index('ts');
      const cur = idx.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c && dropped < dropN) {
          c.delete();
          dropped += 1;
          c.continue();
        } else {
          resolve();
        }
      };
      cur.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
  });
}

/**
 * List events newer than `sinceMs` (inclusive), most-recent first.
 * Returns at most `limit` events.
 */
export async function listEventsSince(sinceMs: number, limit = 1_000): Promise<IntentEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readonly');
    const idx = store.index('ts');
    const range = IDBKeyRange.lowerBound(sinceMs, false);
    const out: IntentEvent[] = [];
    // Walk newest-first via prev cursor.
    const cur = idx.openCursor(range, 'prev');
    cur.onsuccess = () => {
      const c = cur.result;
      if (c && out.length < limit) {
        out.push(c.value as IntentEvent);
        c.continue();
      } else {
        resolve(out);
      }
    };
    cur.onerror = () => reject(cur.error);
  });
}

/**
 * Reset the store. Used by tests + a "Clear /today history" affordance
 * in the privacy section of /today.
 */
export async function clearStore(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = txStore(db, 'readwrite');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** For tests only. */
export function __resetForTests(): void {
  openPromise = null;
}
