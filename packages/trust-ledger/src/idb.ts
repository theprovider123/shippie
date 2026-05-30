/**
 * IndexedDB adapter for the Trust Ledger.
 *
 * One database `shippie-trust-ledger` with two object stores:
 *   - `ledger_rows`: keyPath `id`, indexed by `ts_bucket` and `[app, ts]`
 *     (composite index supplied as a string so it's portable across
 *     browser/fake-indexeddb).
 *   - `vault_seed`: single row `{id: 'device-v1', seed: Uint8Array}`.
 *     The device key (`crypto.ts`) is derived from this seed.
 */

import type { EncryptedLedgerRow } from './types.ts';

export const DB_NAME = 'shippie-trust-ledger';
export const DB_VERSION = 2;
export const LEDGER_STORE = 'ledger_rows';
export const SEED_STORE = 'vault_seed';
export const REVOKE_STORE_NAME = 'revoked_capabilities';

export interface VaultSeedRow {
  id: string;
  seed: Uint8Array;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedDb: IDBDatabase | null = null;

function openInternal(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEDGER_STORE)) {
        const ledger = db.createObjectStore(LEDGER_STORE, { keyPath: 'id' });
        ledger.createIndex('by_ts_bucket', 'ts_bucket', { unique: false });
        ledger.createIndex('by_app_ts', ['app_key', 'ts'], { unique: false });
      }
      if (!db.objectStoreNames.contains(SEED_STORE)) {
        db.createObjectStore(SEED_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(REVOKE_STORE_NAME)) {
        db.createObjectStore(REVOKE_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      cachedDb = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('trust-ledger: open failed'));
  });
}

export function openLedgerDb(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openInternal(factory);
  return dbPromise;
}

export function closeLedgerDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  dbPromise = null;
}

/**
 * Reset module state. Test-only — production code never calls this.
 */
export function _resetForTests(): void {
  cachedDb = null;
  dbPromise = null;
}

function wrapRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('trust-ledger: request failed'));
  });
}

interface IndexableLedgerRow extends EncryptedLedgerRow {
  app_key: string;
  app: string;
  ts: number;
}

/**
 * Persist one encrypted row. Resolves only after the IDB transaction
 * fully commits — this is the durable-commit invariant.
 */
export async function commitRow(
  db: IDBDatabase,
  encrypted: EncryptedLedgerRow,
  meta: { app: string; ts: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readwrite');
    const store = tx.objectStore(LEDGER_STORE);
    const indexable: IndexableLedgerRow = {
      ...encrypted,
      app_key: meta.app,
      app: meta.app,
      ts: meta.ts,
    };
    store.put(indexable);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('trust-ledger: commit failed'));
    tx.onabort = () => reject(tx.error ?? new Error('trust-ledger: commit aborted'));
  });
}

/**
 * Read rows for a single app, newest-first. Returns the encrypted
 * envelopes; the caller decrypts.
 */
export async function readAppRows(
  db: IDBDatabase,
  app: string,
  opts: { since?: number; limit?: number } = {},
): Promise<EncryptedLedgerRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readonly');
    const store = tx.objectStore(LEDGER_STORE);
    const idx = store.index('by_app_ts');
    const lower = opts.since ?? 0;
    const range = IDBKeyRange.bound([app, lower], [app, Number.MAX_SAFE_INTEGER]);
    const results: IndexableLedgerRow[] = [];
    const cursorReq = idx.openCursor(range, 'prev');
    const limit = opts.limit ?? 500;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || results.length >= limit) {
        resolve(results.map(stripIndexFields));
        return;
      }
      results.push(cursor.value as IndexableLedgerRow);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('trust-ledger: read failed'));
    tx.onerror = () => reject(tx.error ?? new Error('trust-ledger: read tx failed'));
  });
}

/**
 * Read every row, newest-first. Used for export.
 */
export async function readAllRows(db: IDBDatabase): Promise<EncryptedLedgerRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readonly');
    const store = tx.objectStore(LEDGER_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as IndexableLedgerRow[]).slice().sort((a, b) => b.ts - a.ts);
      resolve(all.map(stripIndexFields));
    };
    req.onerror = () => reject(req.error ?? new Error('trust-ledger: readAll failed'));
  });
}

/**
 * Drop every row whose ts_bucket < cutoffBucket. Returns count
 * deleted. Uses the index — no decryption happens here.
 */
export async function sweepRetention(
  db: IDBDatabase,
  cutoffBucket: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readwrite');
    const store = tx.objectStore(LEDGER_STORE);
    const idx = store.index('by_ts_bucket');
    const range = IDBKeyRange.upperBound(cutoffBucket, true);
    const cursorReq = idx.openCursor(range);
    let deleted = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('trust-ledger: sweep cursor failed'));
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error ?? new Error('trust-ledger: sweep tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('trust-ledger: sweep aborted'));
  });
}

/**
 * Wipe every row. Returns count deleted.
 */
export async function wipeAll(db: IDBDatabase): Promise<number> {
  const all = await wrapRequest(db.transaction(LEDGER_STORE, 'readonly').objectStore(LEDGER_STORE).count());
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readwrite');
    const store = tx.objectStore(LEDGER_STORE);
    store.clear();
    tx.oncomplete = () => resolve(all);
    tx.onerror = () => reject(tx.error ?? new Error('trust-ledger: wipe failed'));
    tx.onabort = () => reject(tx.error ?? new Error('trust-ledger: wipe aborted'));
  });
}

/**
 * Read the persisted Vault seed for this device, if any.
 */
export async function readSeed(db: IDBDatabase, id: string = 'device-v1'): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEED_STORE, 'readonly');
    const store = tx.objectStore(SEED_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as VaultSeedRow | undefined;
      resolve(row?.seed ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error('trust-ledger: seed read failed'));
  });
}

/**
 * Write a new Vault seed for this device. Caller owns the seed bytes
 * (typically 32 CSPRNG bytes generated once on first launch).
 */
export async function writeSeed(
  db: IDBDatabase,
  seed: Uint8Array,
  id: string = 'device-v1',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEED_STORE, 'readwrite');
    const store = tx.objectStore(SEED_STORE);
    store.put({ id, seed } satisfies VaultSeedRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('trust-ledger: seed write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('trust-ledger: seed write aborted'));
  });
}

function stripIndexFields(row: IndexableLedgerRow): EncryptedLedgerRow {
  return {
    id: row.id,
    ts_bucket: row.ts_bucket,
    iv: row.iv,
    ciphertext: row.ciphertext,
    key_id: row.key_id,
  };
}
