/**
 * BackupAdapter — encrypted league + squad backup.
 *
 * Implements `<BackupCard>`'s `BackupableStore` contract from
 * `@shippie/showcase-kit-v2`. Per spec §7.8, restoring restores both
 * the local squad AND the couch-league state; on restore we mark the
 * standings dirty so peers re-broadcast their scores when they detect
 * this device coming back online.
 *
 * We keep this small and dependency-free — no `@shippie/local-db`
 * detour because the showcase already uses raw `localStorage` for
 * squad + league state.
 */
import type { BackupableStore } from '@shippie/showcase-kit-v2';
import { STORAGE_KEY as TEAM_STORAGE_KEY } from './fantasy-engine.ts';
import { LEAGUE_STORAGE_KEY } from './CouchLeague.tsx';

const BACKUP_VERSION = 1;
const SALT = 'shippie:world-cup-fantasy:backup:v1';

interface BackupBundle {
  v: number;
  exportedAt: number;
  squad: string | null;
  league: string | null;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function readBundle(): BackupBundle {
  const squad = typeof localStorage !== 'undefined' ? localStorage.getItem(TEAM_STORAGE_KEY) : null;
  const league = typeof localStorage !== 'undefined' ? localStorage.getItem(LEAGUE_STORAGE_KEY) : null;
  return { v: BACKUP_VERSION, exportedAt: Date.now(), squad, league };
}

function writeBundle(bundle: BackupBundle): void {
  if (typeof localStorage === 'undefined') return;
  if (bundle.squad === null) localStorage.removeItem(TEAM_STORAGE_KEY);
  else localStorage.setItem(TEAM_STORAGE_KEY, bundle.squad);
  if (bundle.league === null) localStorage.removeItem(LEAGUE_STORAGE_KEY);
  else localStorage.setItem(LEAGUE_STORAGE_KEY, bundle.league);
  // Mark restore so peers can re-broadcast their scores.
  localStorage.setItem('shippie:world-cup-fantasy:restored-at', String(Date.now()));
}

export function createWcfBackupStore(): BackupableStore {
  return {
    async exportEncrypted(passphrase) {
      const bundle = readBundle();
      const json = new TextEncoder().encode(JSON.stringify(bundle));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(passphrase);
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, json),
      );
      const out = new Uint8Array(iv.byteLength + cipher.byteLength);
      out.set(iv, 0);
      out.set(cipher, iv.byteLength);
      return new Blob([out], { type: 'application/octet-stream' });
    },
    async importEncrypted(file, passphrase, opts) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf.byteLength < 13) return { ok: false, error: 'File too small' };
        const iv = buf.slice(0, 12);
        const cipher = buf.slice(12);
        const key = await deriveKey(passphrase);
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          cipher,
        );
        const bundle = JSON.parse(new TextDecoder().decode(plain)) as BackupBundle;
        if (bundle.v !== BACKUP_VERSION) {
          return { ok: false, error: `Unsupported backup version ${bundle.v}` };
        }
        if (opts?.dryRun) return { ok: true, preview: bundle };
        writeBundle(bundle);
        return { ok: true, preview: bundle };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' };
      }
    },
  };
}
