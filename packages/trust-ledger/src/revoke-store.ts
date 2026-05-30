/**
 * Per-(app, capability) revocation store.
 *
 * 5B addition. Lives in the same IndexedDB database as the ledger
 * itself so revocation state is bound to the device that recorded the
 * activity. The bridge gate consults `isRevoked(app, capability)`
 * before invoking the handler; a revoked capability returns
 * `{ok: false, error: {code: 'capability_revoked'}}` and the denial
 * itself is logged as a ledger row.
 */

import { openLedgerDb, REVOKE_STORE_NAME } from './idb.ts';

export const REVOKE_STORE = REVOKE_STORE_NAME;

export interface RevocationRecord {
  /** Composite key: `${app}::${capability}`. */
  id: string;
  app: string;
  capability: string;
  revokedAt: number;
}

function compositeKey(app: string, capability: string): string {
  return `${app}::${capability}`;
}

export interface RevocationStore {
  isRevoked(app: string, capability: string): Promise<boolean>;
  revoke(app: string, capability: string, now?: number): Promise<void>;
  restore(app: string, capability: string): Promise<void>;
  list(): Promise<RevocationRecord[]>;
  clear(): Promise<void>;
}

export async function openRevocationStore(
  factory: IDBFactory = globalThis.indexedDB,
): Promise<RevocationStore> {
  const db = await openLedgerDb(factory);

  function tx(mode: IDBTransactionMode) {
    return db.transaction(REVOKE_STORE, mode);
  }

  return {
    async isRevoked(app, capability) {
      return new Promise((resolve, reject) => {
        const store = tx('readonly').objectStore(REVOKE_STORE);
        const req = store.get(compositeKey(app, capability));
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => reject(req.error ?? new Error('trust-ledger: revoke read failed'));
      });
    },
    async revoke(app, capability, now = Date.now()) {
      return new Promise((resolve, reject) => {
        const t = tx('readwrite');
        const store = t.objectStore(REVOKE_STORE);
        const record: RevocationRecord = {
          id: compositeKey(app, capability),
          app,
          capability,
          revokedAt: now,
        };
        store.put(record);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('trust-ledger: revoke write failed'));
        t.onabort = () => reject(t.error ?? new Error('trust-ledger: revoke aborted'));
      });
    },
    async restore(app, capability) {
      return new Promise((resolve, reject) => {
        const t = tx('readwrite');
        const store = t.objectStore(REVOKE_STORE);
        store.delete(compositeKey(app, capability));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('trust-ledger: revoke restore failed'));
        t.onabort = () => reject(t.error ?? new Error('trust-ledger: revoke restore aborted'));
      });
    },
    async list() {
      return new Promise((resolve, reject) => {
        const store = tx('readonly').objectStore(REVOKE_STORE);
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(
            (req.result as RevocationRecord[]).slice().sort((a, b) => b.revokedAt - a.revokedAt),
          );
        req.onerror = () => reject(req.error ?? new Error('trust-ledger: revoke list failed'));
      });
    },
    async clear() {
      return new Promise((resolve, reject) => {
        const t = tx('readwrite');
        t.objectStore(REVOKE_STORE).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('trust-ledger: revoke clear failed'));
      });
    },
  };
}
