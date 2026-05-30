/**
 * Cycle `BackupableStore` adapter — optional, passphrase-encrypted backup.
 *
 * Unlike a localStorage app, Cycle's records live in the local DB (wa-sqlite /
 * OPFS). The adapter serialises a full export (cycles + days; never the lock
 * PIN, pair code, or settings) and encrypts it with the shared Shippie
 * envelope (PBKDF2-SHA256 → AES-256-GCM) via @shippie/backup-providers. The
 * passphrase is the only key; lose it and the backup is unreadable — that's
 * the point. `dryRun` decrypts + verifies without writing, for the preview
 * confirmation step. A backup is portable to a new device, with no server.
 */
import { decryptBackup, encryptBackup } from '@shippie/backup-providers';
import type { BackupableStore } from '@shippie/showcase-kit-v2';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { exportAll, importAll, type CycleExport } from './lib/data-ops.ts';

const SCHEMA_VERSION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createCycleBackupStore(db: ShippieLocalDb): BackupableStore {
  return {
    async exportEncrypted(passphrase: string): Promise<Blob> {
      const payload = await exportAll(db, new Date().toISOString());
      const wrapped = JSON.stringify({ kind: 'cycle.snapshot', version: SCHEMA_VERSION, payload });
      const result = await encryptBackup({
        appSlug: 'cycle',
        schemaVersion: SCHEMA_VERSION,
        tables: ['cycles', 'days'],
        plaintext: encoder.encode(wrapped),
        passphrase,
      });
      return new Blob([result.bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    },

    async importEncrypted(
      file: Blob,
      passphrase: string,
      opts?: { dryRun?: boolean },
    ): Promise<{ ok: boolean; preview?: unknown; error?: string }> {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decrypted = await decryptBackup(bytes, passphrase);
        if (decrypted.appSlug !== 'cycle') {
          return { ok: false, error: `Backup is for ${decrypted.appSlug}, not Cycle.` };
        }
        const wrapped = JSON.parse(decoder.decode(decrypted.plaintext)) as {
          kind?: string;
          version?: number;
          payload?: CycleExport;
        };
        if (wrapped.kind !== 'cycle.snapshot' || !wrapped.payload) {
          return { ok: false, error: 'Backup envelope is not a Cycle snapshot.' };
        }
        if (opts?.dryRun) {
          return {
            ok: true,
            preview: { exportedAt: decrypted.createdAt, cycles: wrapped.payload.cycles.length, days: wrapped.payload.days.length },
          };
        }
        return await importAll(db, wrapped.payload);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Decrypt failed (wrong passphrase?)' };
      }
    },
  };
}
