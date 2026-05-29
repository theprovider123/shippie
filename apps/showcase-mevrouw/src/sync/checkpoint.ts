/**
 * Sealed checkpoint sync.
 *
 * The SignalRoom relay is live-only: it fans out bytes while peers are
 * connected, but it does not keep history. This module adds a durable
 * encrypted bootstrap snapshot for new or freshly wiped devices.
 */
import * as Y from 'yjs';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

const CHECKPOINT_SCHEMA = 'shippie.sealed-checkpoint.v1';
const SAVE_DEBOUNCE_MS = 2_000;
const MIN_SAVE_INTERVAL_MS = 10_000;

type SaveResult =
  | { ok: true; status: 'saved' | 'skipped'; reason?: string; updateBytes?: number }
  | { ok: false; status: 'failed'; error: string };

type RestoreResult =
  | { ok: true; status: 'restored' | 'missing' | 'skipped'; updateBytes?: number }
  | { ok: false; status: 'failed'; error: string };

export interface CheckpointProvider {
  saveNow: () => Promise<SaveResult>;
  restoreNow: () => Promise<RestoreResult>;
  deleteNow: () => Promise<{ ok: boolean; error?: string }>;
  destroy: () => void;
}

interface CheckpointResponse {
  ok?: boolean;
  exists?: boolean;
  payload?: string;
  update_bytes?: number;
  error?: string;
}

function endpoint(roomId: string): string {
  return `/__shippie/checkpoints/${encodeURIComponent(roomId)}`;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(input.length / 4) * 4,
    '=',
  );
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function readJson(res: Response): Promise<CheckpointResponse | null> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return null;
  return (await res.json()) as CheckpointResponse;
}

function yArrayHasItems(doc: Y.Doc, name: string): boolean {
  return doc.getArray(name).length > 0;
}

function yMapHasEntries(doc: Y.Doc, name: string): boolean {
  return doc.getMap(name).size > 0;
}

function hasNonDefaultMeta(doc: Y.Doc): boolean {
  const meta = doc.getMap('meta');
  const meaningfulScalarKeys = [
    'anniversary_date',
    'first_met_date',
    'next_visit_date',
    'love_note',
  ];
  if (meaningfulScalarKeys.some((key) => Boolean(meta.get(key)))) return true;

  const profiles = (
    meta.get('profiles') as Record<string, string | { display_name?: string }> | undefined
  ) ?? {};
  const names = Object.values(profiles)
    .map((profile) => (
      typeof profile === 'string' ? profile : profile?.display_name
    )?.trim())
    .filter(Boolean);
  if (names.some((name) => name && name.toLowerCase() !== 'me')) return true;

  const avatars = (meta.get('avatars') as Record<string, string> | undefined) ?? {};
  if (Object.keys(avatars).length > 0) return true;

  const optIns = (meta.get('after_hours_optin') as Record<string, boolean> | undefined) ?? {};
  if (Object.values(optIns).some(Boolean)) return true;

  return false;
}

export function hasMeaningfulCoupleData(doc: Y.Doc): boolean {
  if (hasNonDefaultMeta(doc)) return true;

  const arrays = [
    'pulses',
    'memories',
    'surprises',
    'glimpses',
    'gifts',
    'journal_entries',
    'todos',
    'ttol_rounds',
    'hwdkm_rounds',
    'trips',
  ];
  if (arrays.some((name) => yArrayHasItems(doc, name))) return true;

  const maps = [
    'tot',
    'fantasy',
    'dice',
    'daily',
    'positions',
    'ynm',
    'whispers',
    'nhie',
    'wyr',
    'tod',
    'shifts',
    'shift-parts',
    'schedule-refs',
  ];
  return maps.some((name) => yMapHasEntries(doc, name));
}

export function bindCheckpointProvider(
  doc: Y.Doc,
  roomId: string,
  coupleCode: string,
): CheckpointProvider {
  let destroyed = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSaveAt = 0;
  let keyPromise: Promise<CryptoKey> | null = null;

  function key(): Promise<CryptoKey> {
    keyPromise ??= deriveKey(coupleCode);
    return keyPromise;
  }

  async function restoreNow(): Promise<RestoreResult> {
    if (destroyed || typeof fetch !== 'function') return { ok: true, status: 'skipped' };
    try {
      const res = await fetch(endpoint(roomId), {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return { ok: true, status: 'missing' };
      const body = await readJson(res);
      if (!body?.exists || typeof body.payload !== 'string') return { ok: true, status: 'missing' };
      const frame = unpackFrame(base64urlToBytes(body.payload));
      const update = await decrypt(await key(), frame);
      Y.applyUpdate(doc, update, 'checkpoint-restore');
      return { ok: true, status: 'restored', updateBytes: body.update_bytes ?? update.byteLength };
    } catch (err) {
      return {
        ok: false,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function saveNow(): Promise<SaveResult> {
    if (destroyed || typeof fetch !== 'function') return { ok: true, status: 'skipped' };
    if (!hasMeaningfulCoupleData(doc)) {
      return { ok: true, status: 'skipped', reason: 'empty_doc' };
    }
    try {
      const update = Y.encodeStateAsUpdate(doc);
      const frame = await encrypt(await key(), update);
      const res = await fetch(endpoint(roomId), {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          schema: CHECKPOINT_SCHEMA,
          update_bytes: update.byteLength,
          payload: bytesToBase64url(packFrame(frame)),
        }),
      });
      if (res.status === 409) {
        return { ok: true, status: 'skipped', reason: 'server_has_larger_checkpoint' };
      }
      if (!res.ok) {
        const body = await readJson(res);
        throw new Error(body?.error ?? `checkpoint_save_${res.status}`);
      }
      lastSaveAt = Date.now();
      return { ok: true, status: 'saved', updateBytes: update.byteLength };
    } catch (err) {
      return {
        ok: false,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function deleteNow(): Promise<{ ok: boolean; error?: string }> {
    if (typeof fetch !== 'function') return { ok: false, error: 'fetch_unavailable' };
    try {
      const res = await fetch(endpoint(roomId), {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        const body = await readJson(res);
        throw new Error(body?.error ?? `checkpoint_delete_${res.status}`);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  function scheduleSave(): void {
    if (destroyed) return;
    if (!hasMeaningfulCoupleData(doc)) return;
    const wait = Math.max(SAVE_DEBOUNCE_MS, MIN_SAVE_INTERVAL_MS - (Date.now() - lastSaveAt));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveNow();
    }, wait);
  }

  function maybeRestoreThenSave(): void {
    void restoreNow().then(() => saveNow());
  }

  const onVisibilityChange = () => {
    if (!document.hidden) maybeRestoreThenSave();
    else scheduleSave();
  };

  doc.on('update', scheduleSave);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', maybeRestoreThenSave);
    window.addEventListener('focus', maybeRestoreThenSave);
    window.addEventListener('pagehide', scheduleSave);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    saveNow,
    restoreNow,
    deleteNow,
    destroy(): void {
      destroyed = true;
      doc.off('update', scheduleSave);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', maybeRestoreThenSave);
        window.removeEventListener('focus', maybeRestoreThenSave);
        window.removeEventListener('pagehide', scheduleSave);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
  };
}
