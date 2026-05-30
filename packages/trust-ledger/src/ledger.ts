/**
 * Trust Ledger — public composition of crypto + IDB + redaction.
 *
 * The Ledger is the on-device durable journal of every capability call
 * and every Shippie-originated telemetry event. Callers commit rows;
 * the Ledger encrypts and persists them before the promise resolves.
 *
 * Sweep and wipe operate on the IDB index without decrypting.
 */

import { decryptRow, encryptRow } from './crypto.ts';
import {
  closeLedgerDb,
  commitRow as commitRowToDb,
  openLedgerDb,
  readAllRows,
  readAppRows,
  readSeed,
  sweepRetention as sweepRetentionInDb,
  wipeAll,
  writeSeed,
  DB_NAME,
} from './idb.ts';
import { assertRowIsRedacted } from './redact.ts';
import type { EncryptedLedgerRow, LedgerKey, LedgerRow, TelemetrySource } from './types.ts';

const DEFAULT_RETENTION_MS = 30 * 24 * 3_600_000;
const BUCKET_MS = 3_600_000;
const DEFAULT_SEED_BYTES = 32;

export interface Ledger {
  /** Durably commit a row. Resolves only after IDB write completes. */
  commit(row: LedgerRow): Promise<void>;
  /** Read rows for one app, newest-first. */
  readApp(app: string, opts?: { since?: number; limit?: number }): Promise<LedgerRow[]>;
  /** Read recent telemetry-egress rows across all apps. */
  readTelemetry(opts?: { since?: number; limit?: number; sources?: readonly TelemetrySource[] }): Promise<LedgerRow[]>;
  /** Drop every row older than cutoffTs. Returns count deleted. */
  sweepRetention(cutoffTs: number): Promise<number>;
  /** Export every row as plain JSON. */
  exportAll(): Promise<LedgerRow[]>;
  /** Irrevocable wipe. Emits a single ledger-internal 'wipe' row first. */
  wipe(): Promise<number>;
  /** Close the underlying IDB connection. Test-only / safe-mode. */
  close(): void;
}

export interface LedgerOptions {
  key: LedgerKey;
  retentionMs?: number;
  idbFactory?: IDBFactory;
  /** Inject for tests to bypass DOM crypto/idb timing. */
  ulid?: () => string;
  /** Inject for tests. */
  now?: () => number;
}

export async function createLedger(options: LedgerOptions): Promise<Ledger> {
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  const factory = options.idbFactory ?? globalThis.indexedDB;
  if (!factory) {
    throw new Error('trust-ledger: indexedDB is not available in this runtime');
  }
  const db = await openLedgerDb(factory);
  const ulidGen = options.ulid ?? (await import('./ulid.ts')).ulid;
  const now = options.now ?? (() => Date.now());

  async function commit(row: LedgerRow): Promise<void> {
    assertRowIsRedacted(row);
    const env = await encryptRow(options.key, row);
    await commitRowToDb(db, env, { app: row.app, ts: row.ts });
  }

  async function decryptMany(envs: EncryptedLedgerRow[]): Promise<LedgerRow[]> {
    const out: LedgerRow[] = [];
    for (const env of envs) {
      try {
        out.push(await decryptRow(options.key, env));
      } catch {
        // Skip rows that fail to decrypt (e.g. encrypted under a
        // previous key generation). 5B will introduce a rotation
        // routine that re-keys old rows.
      }
    }
    return out;
  }

  return {
    async commit(row: LedgerRow): Promise<void> {
      await commit(row);
    },

    async readApp(app: string, opts: { since?: number; limit?: number } = {}): Promise<LedgerRow[]> {
      const envs = await readAppRows(db, app, opts);
      return decryptMany(envs);
    },

    async readTelemetry(opts: { since?: number; limit?: number; sources?: readonly TelemetrySource[] } = {}): Promise<LedgerRow[]> {
      const envs = await readAllRows(db);
      const rows = await decryptMany(envs);
      const since = opts.since ?? 0;
      const limit = opts.limit ?? 200;
      const allowed = opts.sources ? new Set<TelemetrySource>(opts.sources) : null;
      return rows
        .filter((r) => r.category === 'telemetry-egress')
        .filter((r) => r.ts >= since)
        .filter((r) => !allowed || (r.source && allowed.has(r.source)))
        .slice(0, limit);
    },

    async sweepRetention(cutoffTs: number): Promise<number> {
      const cutoffBucket = Math.floor(cutoffTs / BUCKET_MS);
      return sweepRetentionInDb(db, cutoffBucket);
    },

    async exportAll(): Promise<LedgerRow[]> {
      const envs = await readAllRows(db);
      return decryptMany(envs);
    },

    async wipe(): Promise<number> {
      await commit({
        id: ulidGen(),
        ts: now(),
        app: '__shippie_shell__',
        capability: 'ledger.wipe',
        category: 'ledger-internal',
        summary: 'ledger wiped by user',
        outcome: 'ok',
      });
      return wipeAll(db);
    },

    close(): void {
      closeLedgerDb();
    },
  };

  void retentionMs; // reserved — sweep cadence belongs to the host
}

/**
 * Read the persisted device seed, generating one on first call.
 *
 * 5A spec lock-down: the seed is persisted as a plain IDB row under
 * the `vault_seed` store so a future profile-scoped Vault (Tranche 4)
 * can replace it without ledger schema migration.
 */
export async function getOrCreateDeviceSeed(
  factory: IDBFactory = globalThis.indexedDB,
): Promise<Uint8Array> {
  const db = await openLedgerDb(factory);
  const existing = await readSeed(db);
  if (existing) return existing;
  const fresh = new Uint8Array(DEFAULT_SEED_BYTES);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(fresh);
  } else {
    for (let i = 0; i < DEFAULT_SEED_BYTES; i++) fresh[i] = Math.floor(Math.random() * 256);
  }
  await writeSeed(db, fresh);
  return fresh;
}

export { DB_NAME };
