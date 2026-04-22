// apps/web/lib/shippie/sw-sync.ts
/**
 * IndexedDB-backed offline beacon queue.
 *
 * Called from two sides:
 *   - The wrapper runtime (in a normal browsing context) queues a
 *     beacon when `navigator.sendBeacon` or `fetch` fails / the
 *     network is offline, then asks the SW to register a sync.
 *   - The service worker, on a `sync` event, drains the queue by
 *     re-POSTing each entry. Successes and client-errors (non-retryable)
 *     remove the row; 5xx and 429 leave it for the next sync.
 *
 * Pure browser APIs — no dependencies.
 */

const DB_NAME = 'shippie-beacon-queue';
const STORE = 'queue';
const DB_VERSION = 1;

interface QueueRow {
  id?: number;
  endpoint: string;
  body: string;
  queued_at: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueBeacon(endpoint: string, body: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const row: QueueRow = { endpoint, body, queued_at: Date.now() };
    store.add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function listQueue(db: IDBDatabase): Promise<QueueRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as QueueRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRows(db: IDBDatabase, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function shouldRetry(status: number): boolean {
  return status >= 500 || status === 429;
}

export async function flushBeaconQueue(): Promise<void> {
  const db = await openDb();
  try {
    const rows = await listQueue(db);
    if (rows.length === 0) return;
    const toDelete: number[] = [];
    await Promise.all(
      rows.map(async (row) => {
        if (row.id === undefined) return;
        try {
          const res = await fetch(row.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: row.body,
            keepalive: true,
          });
          if (!shouldRetry(res.status)) {
            toDelete.push(row.id);
          }
        } catch {
          // Network error — leave in queue for retry.
        }
      }),
    );
    await deleteRows(db, toDelete);
  } finally {
    db.close();
  }
}
