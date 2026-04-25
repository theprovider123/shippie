/**
 * Device-to-device data transfer over the Proximity Protocol.
 *
 * Reuses the WebRTC plumbing the rest of `@shippie/proximity` already
 * builds — but with a **one-time room** and a **transfer key** baked
 * into the QR code, not derived from a join code. This means: no need
 * to share a passphrase, no risk of a hostile listener guessing a
 * short rendezvous. The 32-byte key is generated on the owner device,
 * encoded into the QR alongside the room id, and discarded as soon
 * as the transfer finishes.
 *
 * Flow:
 *   Owner:  generate room id + 32-byte transfer key.
 *           render `shippie-transfer://?room=<id>&k=<base64url>`.
 *           wait for receiver to join, then stream:
 *             - DB rows (paged, 500 rows / chunk)
 *             - Files (chunked, 256 KiB / chunk)
 *           every chunk wrapped in AES-GCM with the transfer key.
 *   Receiver:
 *           scan QR → join the same one-time room.
 *           receive frames in order, decrypt, reassemble, hand to
 *           local-db / local-files restore APIs via the supplied
 *           `applyChunk` callback.
 *           emit progress events all the way through.
 *
 * The wire protocol is intentionally minimal:
 *   { t: 'manifest', totalRows, totalFiles, totalBytes, schemaVersion }
 *   { t: 'row',      table, idx, payload[] }     // payload: rows
 *   { t: 'file-meta',fileId, name, size, mime }
 *   { t: 'file-chunk', fileId, idx, bytes }      // bytes: Uint8Array
 *   { t: 'done' }
 *
 * Cancellation: either side can call `transfer.cancel()` and the
 * datachannel closes; both sides emit `cancelled`.
 */
import type { JoinCode, PeerId } from './types.ts';

// ---------------------------------------------------------------------
// Public Group API surface this module depends on. The proximity
// package's `group.ts` is being built in parallel; once it lands these
// type aliases collapse to its public types. Until then we keep them
// here so this module typechecks in isolation.
// ---------------------------------------------------------------------

export interface TransferGroupHandle {
  readonly selfId: PeerId;
  /** Send a binary frame to all other members of the group. */
  broadcastBinary: (channel: string, bytes: Uint8Array) => Promise<void>;
  /** Subscribe to binary frames on a channel. Returns unsubscribe. */
  onBinary: (
    channel: string,
    handler: (bytes: Uint8Array, peerId: PeerId) => void,
  ) => () => void;
  /** Wait for at least one peer to join. Resolves with their peerId. */
  awaitPeer: (timeoutMs?: number) => Promise<PeerId>;
  /** Disconnect and tear down. */
  destroy: () => Promise<void>;
}

export interface TransferGroupApi {
  /**
   * Create a one-time room. The owner side. Returns immediately with
   * the room id + transfer key + a Group handle.
   */
  createTransferRoom: (input: { appSlug: string }) => Promise<{
    roomId: string;
    joinCode: JoinCode;
    transferKey: Uint8Array;
    group: TransferGroupHandle;
  }>;

  /**
   * Join an existing transfer room. Receiver side.
   */
  joinTransferRoom: (input: {
    appSlug: string;
    joinCode: JoinCode;
    transferKey: Uint8Array;
  }) => Promise<{ group: TransferGroupHandle }>;
}

// ---------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------

export const TRANSFER_CHANNEL = 'transfer:v1';

export type TransferFrame =
  | TransferManifestFrame
  | TransferRowsFrame
  | TransferFileMetaFrame
  | TransferFileChunkFrame
  | TransferDoneFrame
  | TransferCancelFrame;

export interface TransferManifestFrame {
  t: 'manifest';
  schemaVersion: number;
  totalRows: number;
  totalFiles: number;
  totalBytes: number;
  appSlug: string;
}

export interface TransferRowsFrame {
  t: 'rows';
  table: string;
  /** Sequence index within this table — for ordering / dedup. */
  idx: number;
  /** Rows as JSON-serialisable objects. */
  rows: unknown[];
}

export interface TransferFileMetaFrame {
  t: 'file-meta';
  fileId: string;
  name: string;
  size: number;
  mime: string;
}

export interface TransferFileChunkFrame {
  t: 'file-chunk';
  fileId: string;
  idx: number;
  /** Final chunk for this file? */
  last: boolean;
  /** Base64 of the bytes. */
  bytesB64: string;
}

export interface TransferDoneFrame {
  t: 'done';
}

export interface TransferCancelFrame {
  t: 'cancel';
  reason?: string;
}

// ---------------------------------------------------------------------
// Snapshot input — the source of truth on the owner device.
// ---------------------------------------------------------------------

export interface TransferSnapshot {
  appSlug: string;
  schemaVersion: number;
  /** Async iterators chosen so we never load the whole DB into RAM. */
  rows: AsyncIterable<{ table: string; rows: unknown[] }>;
  files: AsyncIterable<{
    fileId: string;
    name: string;
    size: number;
    mime: string;
    bytes: AsyncIterable<Uint8Array>;
  }>;
  /** Aggregate byte count for progress %; rough is fine. */
  totalBytes: number;
  /** Aggregate row count. */
  totalRows: number;
  /** Aggregate file count. */
  totalFiles: number;
}

// ---------------------------------------------------------------------
// Progress events
// ---------------------------------------------------------------------

export type TransferEvent =
  | { type: 'manifest'; manifest: TransferManifestFrame }
  | { type: 'progress'; sent: number; total: number; pct: number }
  | { type: 'row-batch'; table: string; rows: number }
  | { type: 'file-start'; fileId: string; name: string; size: number; mime: string }
  | { type: 'file-chunk'; fileId: string; bytes: number }
  | { type: 'file-end'; fileId: string }
  | { type: 'done' }
  | { type: 'cancelled'; reason?: string }
  | { type: 'error'; error: string };

export type TransferListener = (e: TransferEvent) => void;

// ---------------------------------------------------------------------
// Crypto: AES-256-GCM with the 32-byte transfer key.
// ---------------------------------------------------------------------

async function importTransferKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.byteLength !== 32) {
    throw new Error(`transfer key must be 32 bytes, got ${key.byteLength}`);
  }
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptFrame(key: CryptoKey, frame: TransferFrame): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(frame));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(plaintext)),
  );
  // Wire format: 12-byte iv || ciphertext.
  const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(ciphertext, iv.byteLength);
  return out;
}

export async function decryptFrame(key: CryptoKey, bytes: Uint8Array): Promise<TransferFrame> {
  if (bytes.byteLength < 12 + 16) throw new Error('transfer: frame too short');
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(ct)),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as TransferFrame;
}

// ---------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------

export interface SendTransferOptions {
  group: TransferGroupHandle;
  transferKey: Uint8Array;
  snapshot: TransferSnapshot;
  /** Subscribe to progress events. */
  on?: TransferListener;
  /** Allow the caller to abort mid-transfer. */
  signal?: AbortSignal;
  /** Bytes per file chunk on the wire. Default 256 KiB. */
  chunkBytes?: number;
}

export interface SendTransferResult {
  ok: boolean;
  bytesSent: number;
  rowsSent: number;
  filesSent: number;
  cancelled?: boolean;
  error?: string;
}

export async function sendTransfer(opts: SendTransferOptions): Promise<SendTransferResult> {
  const emit = opts.on ?? (() => {});
  const chunkBytes = opts.chunkBytes ?? 256 * 1024;
  const key = await importTransferKey(opts.transferKey);

  let bytesSent = 0;
  let rowsSent = 0;
  let filesSent = 0;
  let cancelled = false;

  const abortListener = () => {
    cancelled = true;
  };
  opts.signal?.addEventListener('abort', abortListener, { once: true });

  const send = async (frame: TransferFrame): Promise<void> => {
    const wire = await encryptFrame(key, frame);
    await opts.group.broadcastBinary(TRANSFER_CHANNEL, wire);
    bytesSent += wire.byteLength;
    emit({
      type: 'progress',
      sent: bytesSent,
      total: opts.snapshot.totalBytes,
      pct: opts.snapshot.totalBytes > 0
        ? Math.min(100, Math.round((bytesSent / opts.snapshot.totalBytes) * 100))
        : 0,
    });
  };

  try {
    const manifest: TransferManifestFrame = {
      t: 'manifest',
      schemaVersion: opts.snapshot.schemaVersion,
      totalRows: opts.snapshot.totalRows,
      totalFiles: opts.snapshot.totalFiles,
      totalBytes: opts.snapshot.totalBytes,
      appSlug: opts.snapshot.appSlug,
    };
    emit({ type: 'manifest', manifest });
    await send(manifest);

    let rowIdx = 0;
    for await (const batch of opts.snapshot.rows) {
      if (cancelled) break;
      await send({ t: 'rows', table: batch.table, idx: rowIdx++, rows: batch.rows });
      rowsSent += batch.rows.length;
      emit({ type: 'row-batch', table: batch.table, rows: batch.rows.length });
    }

    for await (const file of opts.snapshot.files) {
      if (cancelled) break;
      await send({
        t: 'file-meta',
        fileId: file.fileId,
        name: file.name,
        size: file.size,
        mime: file.mime,
      });
      emit({
        type: 'file-start',
        fileId: file.fileId,
        name: file.name,
        size: file.size,
        mime: file.mime,
      });

      let chunkIdx = 0;
      let buffer: Uint8Array[] = [];
      let buffered = 0;
      const drain = async (last: boolean): Promise<void> => {
        if (buffered === 0 && !last) return;
        const merged = new Uint8Array(buffered);
        let offset = 0;
        for (const part of buffer) {
          merged.set(part, offset);
          offset += part.byteLength;
        }
        buffer = [];
        buffered = 0;
        await send({
          t: 'file-chunk',
          fileId: file.fileId,
          idx: chunkIdx++,
          last,
          bytesB64: bytesToBase64(merged),
        });
        emit({ type: 'file-chunk', fileId: file.fileId, bytes: merged.byteLength });
      };

      for await (const part of file.bytes) {
        if (cancelled) break;
        buffer.push(part);
        buffered += part.byteLength;
        while (buffered >= chunkBytes) {
          // Slice the leading chunkBytes worth and send.
          const merged = new Uint8Array(buffered);
          let offset = 0;
          for (const seg of buffer) {
            merged.set(seg, offset);
            offset += seg.byteLength;
          }
          const head = merged.slice(0, chunkBytes);
          const tail = merged.slice(chunkBytes);
          buffer = tail.byteLength > 0 ? [tail] : [];
          buffered = tail.byteLength;
          await send({
            t: 'file-chunk',
            fileId: file.fileId,
            idx: chunkIdx++,
            last: false,
            bytesB64: bytesToBase64(head),
          });
          emit({ type: 'file-chunk', fileId: file.fileId, bytes: head.byteLength });
        }
      }
      if (cancelled) break;
      await drain(true);
      filesSent += 1;
      emit({ type: 'file-end', fileId: file.fileId });
    }

    if (cancelled) {
      await send({ t: 'cancel', reason: 'sender-aborted' });
      emit({ type: 'cancelled', reason: 'sender-aborted' });
      return { ok: false, bytesSent, rowsSent, filesSent, cancelled: true };
    }

    await send({ t: 'done' });
    emit({ type: 'done' });
    return { ok: true, bytesSent, rowsSent, filesSent };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'error', error: message });
    return { ok: false, bytesSent, rowsSent, filesSent, error: message };
  } finally {
    opts.signal?.removeEventListener('abort', abortListener);
  }
}

// ---------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------

export interface ReceiveTransferOptions {
  group: TransferGroupHandle;
  transferKey: Uint8Array;
  /** Apply a decoded frame. The receiver decides what to do with it
   * (e.g. insert rows into local-db, write file bytes to OPFS). */
  apply: (frame: TransferFrame) => Promise<void> | void;
  on?: TransferListener;
  signal?: AbortSignal;
  /** Treat as cancelled if no frame arrives within this many ms. */
  idleTimeoutMs?: number;
}

export interface ReceiveTransferResult {
  ok: boolean;
  bytesReceived: number;
  cancelled?: boolean;
  error?: string;
}

export async function receiveTransfer(opts: ReceiveTransferOptions): Promise<ReceiveTransferResult> {
  const emit = opts.on ?? (() => {});
  const key = await importTransferKey(opts.transferKey);
  let bytesReceived = 0;
  let manifest: TransferManifestFrame | null = null;
  let cancelled = false;

  return new Promise<ReceiveTransferResult>((resolve) => {
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (result: ReceiveTransferResult) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const resetIdle = () => {
      if (!opts.idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        emit({ type: 'error', error: 'idle-timeout' });
        settle({ ok: false, bytesReceived, error: 'idle-timeout' });
      }, opts.idleTimeoutMs);
    };

    const onAbort = () => {
      cancelled = true;
      emit({ type: 'cancelled', reason: 'receiver-aborted' });
      settle({ ok: false, bytesReceived, cancelled: true });
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const unsubscribe = opts.group.onBinary(TRANSFER_CHANNEL, (bytes) => {
      if (settled) return;
      bytesReceived += bytes.byteLength;
      resetIdle();
      void (async () => {
        let frame: TransferFrame;
        try {
          frame = await decryptFrame(key, bytes);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          emit({ type: 'error', error });
          settle({ ok: false, bytesReceived, error });
          return;
        }
        try {
          if (frame.t === 'manifest') {
            manifest = frame;
            emit({ type: 'manifest', manifest });
          } else if (frame.t === 'rows') {
            emit({ type: 'row-batch', table: frame.table, rows: frame.rows.length });
          } else if (frame.t === 'file-meta') {
            emit({
              type: 'file-start',
              fileId: frame.fileId,
              name: frame.name,
              size: frame.size,
              mime: frame.mime,
            });
          } else if (frame.t === 'file-chunk') {
            emit({
              type: 'file-chunk',
              fileId: frame.fileId,
              bytes: base64ByteLength(frame.bytesB64),
            });
            if (frame.last) emit({ type: 'file-end', fileId: frame.fileId });
          } else if (frame.t === 'cancel') {
            cancelled = true;
            await opts.apply(frame);
            emit({ type: 'cancelled', reason: frame.reason });
            settle({ ok: false, bytesReceived, cancelled: true });
            return;
          }

          await opts.apply(frame);

          if (manifest) {
            emit({
              type: 'progress',
              sent: bytesReceived,
              total: manifest.totalBytes,
              pct: manifest.totalBytes > 0
                ? Math.min(100, Math.round((bytesReceived / manifest.totalBytes) * 100))
                : 0,
            });
          }

          if (frame.t === 'done') {
            emit({ type: 'done' });
            settle({ ok: true, bytesReceived });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          emit({ type: 'error', error });
          settle({ ok: false, bytesReceived, error });
        }
      })();
    });

    resetIdle();
    if (cancelled) settle({ ok: false, bytesReceived, cancelled: true });
  });
}

// ---------------------------------------------------------------------
// QR code payload helpers — owner encodes, receiver decodes.
// ---------------------------------------------------------------------

export interface TransferQrPayload {
  joinCode: JoinCode;
  transferKey: Uint8Array;
  appSlug: string;
}

/**
 * Encode the QR payload as a `shippie-transfer://` URL. The wrapper's
 * scanQR helper parses the URL and feeds it back to the receiver.
 */
export function encodeTransferQr(payload: TransferQrPayload): string {
  const params = new URLSearchParams();
  params.set('app', payload.appSlug);
  params.set('code', payload.joinCode);
  params.set('k', bytesToBase64Url(payload.transferKey));
  return `shippie-transfer://?${params.toString()}`;
}

export function decodeTransferQr(text: string): TransferQrPayload | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'shippie-transfer:') return null;
  const code = url.searchParams.get('code');
  const k = url.searchParams.get('k');
  const app = url.searchParams.get('app');
  if (!code || !k || !app) return null;
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(k);
  } catch {
    return null;
  }
  if (bytes.byteLength !== 32) return null;
  return { joinCode: code, transferKey: bytes, appSlug: app };
}

/**
 * Generate a one-time 32-byte transfer key. Used by owners.
 */
export function generateTransferKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Base64 string byte length without decoding. */
function base64ByteLength(value: string): number {
  const padding = (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  return Math.floor((value.length * 3) / 4) - padding;
}
