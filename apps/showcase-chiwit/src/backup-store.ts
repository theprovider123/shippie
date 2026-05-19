/**
 * Chiwit `BackupableStore` adapter.
 *
 * Chiwit's local state lives in `localStorage` under
 * `shippie.chiwit.daily-pulse.v1` (see App.tsx). The adapter:
 *   - `exportEncrypted(passphrase)`  → encrypted .shippiebak Blob
 *   - `importEncrypted(file, …)`     → verify + replace local state
 *
 * Encryption is delegated to `@shippie/backup-providers`'s
 * `encryptBackup` / `decryptBackup` so Chiwit shares the same envelope
 * (PBKDF2-SHA256 → AES-256-GCM) every other Shippie app uses.
 *
 * The `dryRun` option is honoured by decrypting + JSON-parsing the
 * payload but skipping the localStorage write, so BackupCard's preview
 * confirmation step gets a real verify pass.
 */
import {
  encryptBackup,
  decryptBackup,
} from '@shippie/backup-providers';
import type { BackupableStore } from '@shippie/showcase-kit-v2';

const STORAGE_KEY = 'shippie.chiwit.daily-pulse.v1';
const SCHEMA_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function readChiwitSnapshot(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function writeChiwitSnapshot(raw: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, raw);
}

export function createChiwitBackupStore(): BackupableStore {
  return {
    async exportEncrypted(passphrase: string): Promise<Blob> {
      const raw = readChiwitSnapshot();
      // Wrap the raw JSON in a small header so future schema migrations
      // can branch on `kind` without re-encrypting.
      const wrapped = JSON.stringify({
        kind: 'chiwit.snapshot',
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        payload: raw ? JSON.parse(raw) : null,
      });
      const result = await encryptBackup({
        appSlug: 'chiwit',
        schemaVersion: SCHEMA_VERSION,
        tables: ['entries', 'checkins'],
        plaintext: encoder.encode(wrapped),
        passphrase,
      });
      // Wrap the underlying Uint8Array as an ArrayBuffer to satisfy Blob's
      // expected `BlobPart` type; some TS lib variants surface
      // `Uint8Array<ArrayBufferLike>` which trips structural checks.
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
        if (decrypted.appSlug !== 'chiwit') {
          return { ok: false, error: `Backup is for ${decrypted.appSlug}, not chiwit.` };
        }
        const text = decoder.decode(decrypted.plaintext);
        const wrapped = JSON.parse(text) as {
          kind?: string;
          version?: number;
          payload?: unknown;
        };
        if (wrapped.kind !== 'chiwit.snapshot') {
          return { ok: false, error: 'Backup envelope is not a Chiwit snapshot.' };
        }
        if (opts?.dryRun) {
          return { ok: true, preview: { exportedAt: decrypted.createdAt, version: wrapped.version } };
        }
        const payload = wrapped.payload;
        writeChiwitSnapshot(payload ? JSON.stringify(payload) : '');
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Decrypt failed (wrong passphrase?)',
        };
      }
    },
  };
}
