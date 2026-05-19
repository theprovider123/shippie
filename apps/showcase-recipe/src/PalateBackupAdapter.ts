/**
 * Backup adapter for the Palate showcase, shaped to satisfy
 * `<BackupCard>`'s `BackupableStore` contract from `@shippie/showcase-kit-v2`.
 *
 * Wraps the existing iOS-aware backup primitives shipped in commit
 * `4b15c45`:
 *   - `encodeEncryptedBackup` / `decodeEncryptedBackup` from `@shippie/local-db`
 *   - `saveBackupBlob` for share-sheet vs. download fallback
 *
 * Source of truth in this showcase is `localStorage` (see App.tsx
 * `STORAGE_KEY`). The adapter encrypts that blob with the user's
 * passphrase + decodes it back symmetrically. Dry-run validates the
 * passphrase + schema without mutating local state.
 */
import { decodeEncryptedBackup, encodeEncryptedBackup } from '@shippie/local-db';
import type { BackupableStore } from '@shippie/showcase-kit-v2';

export const PALATE_BACKUP_KIND = 'shippie.palate.backup.v1';
export const STORAGE_KEY = 'shippie.palate.recipe-hub.v1';

interface PalateBackupPayload {
  kind: typeof PALATE_BACKUP_KIND;
  exportedAt: string;
  state: unknown;
}

export function createPalateBackupStore(): BackupableStore {
  return {
    async exportEncrypted(passphrase) {
      const trimmed = passphrase.trim();
      if (!trimmed) throw new Error('Enter a backup passphrase.');
      const raw = readLocalState();
      const payload: PalateBackupPayload = {
        kind: PALATE_BACKUP_KIND,
        exportedAt: new Date().toISOString(),
        state: raw,
      };
      const plaintext = new TextEncoder().encode(JSON.stringify(payload));
      const encoded = await encodeEncryptedBackup({
        appId: 'palate',
        schemaVersion: 1,
        tables: ['palate-state'],
        plaintext,
        passphrase: trimmed,
      });
      return encoded.blob;
    },
    async importEncrypted(file, passphrase, opts) {
      const trimmed = passphrase.trim();
      if (!trimmed) {
        return { ok: false, error: 'Enter the backup passphrase.' };
      }
      try {
        const decoded = await decodeEncryptedBackup(file, trimmed);
        const parsed = JSON.parse(new TextDecoder().decode(decoded.plaintext)) as PalateBackupPayload;
        if (!parsed || parsed.kind !== PALATE_BACKUP_KIND) {
          return { ok: false, error: 'This is not a Palate backup.' };
        }
        if (opts?.dryRun) {
          return { ok: true, preview: { exportedAt: parsed.exportedAt } };
        }
        writeLocalState(parsed.state);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' };
      }
    },
  };
}

function readLocalState(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalState(value: unknown): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* swallow — storage unavailable */
  }
}
