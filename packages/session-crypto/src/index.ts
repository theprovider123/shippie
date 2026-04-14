/**
 * Session crypto primitives shared between apps/web (Node 20+) and
 * services/worker (Cloudflare Workers). All implementations use the
 * Web Crypto API via globalThis.crypto so there are no Node-only
 * dependencies.
 *
 * Used for:
 *   - Generating opaque session handles (cookies)
 *   - Hashing handles for storage in app_sessions.handle_hash
 *   - HMAC-signing Worker → Platform internal API requests
 *   - Verifying iOS verify-kit callback HMACs
 *
 * Spec references:
 *   - v6 §6.1, §6.3 — opaque session handles
 *   - v6 §13.6     — verify-kit HMAC over (app_id|signing_config_id|nonce|result|log_sha256)
 *
 * IMPORTANT: This package never stores keys. Callers pass the secret
 * material at every call. Key storage and rotation live in app code.
 */

const HANDLE_BYTE_LENGTH = 32;
const HMAC_TIMESTAMP_TOLERANCE_MS = 30_000;

const subtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SubtleCrypto unavailable in this runtime');
  }
  return globalThis.crypto.subtle;
};

const textEncoder = new TextEncoder();

/* ------------------------------------------------------------------ *
 * Random + encoding helpers                                          *
 * ------------------------------------------------------------------ */

/**
 * Allocate a fresh Uint8Array backed by an ArrayBuffer (not SharedArrayBuffer).
 * Required so SubtleCrypto APIs accept the buffer under TS 5.7+ strict typing.
 */
function freshBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

/**
 * Generate a fresh opaque session handle. 32 bytes of CSPRNG output,
 * base64url-encoded with no padding. Cookie-safe.
 */
export function generateSessionHandle(): string {
  const bytes = freshBytes(HANDLE_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate a one-time nonce for HMAC-signed callbacks (verify kits, etc.).
 */
export function generateNonce(byteLength = 16): string {
  const bytes = freshBytes(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + padding);
  const bytes = freshBytes(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

/* ------------------------------------------------------------------ *
 * Hashing                                                            *
 * ------------------------------------------------------------------ */

function encodeUtf8(input: string): Uint8Array<ArrayBuffer> {
  // textEncoder.encode returns Uint8Array<ArrayBufferLike> under TS 5.7+,
  // but we need Uint8Array<ArrayBuffer> for SubtleCrypto. Copy into a fresh
  // ArrayBuffer-backed Uint8Array.
  const view = textEncoder.encode(input);
  const out = freshBytes(view.byteLength);
  out.set(view);
  return out;
}

/**
 * SHA-256 hash of an opaque session handle. Returns hex.
 * This is what gets stored in app_sessions.handle_hash.
 */
export async function hashHandle(handle: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', encodeUtf8(handle));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * SHA-256 of an arbitrary byte buffer. Returns hex.
 * Used for verify-kit log integrity checks.
 */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === 'string' ? encodeUtf8(data) : toArrayBufferBytes(data);
  const digest = await subtle().digest('SHA-256', buf);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Coerce a Uint8Array of any backing buffer flavor into one backed by a
 * plain ArrayBuffer, copying if necessary. Lets callers pass either type
 * to functions that need a strict ArrayBuffer-backed view.
 */
function toArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  if (input.buffer instanceof ArrayBuffer && input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
    return input as Uint8Array<ArrayBuffer>;
  }
  const out = freshBytes(input.byteLength);
  out.set(input);
  return out;
}

/* ------------------------------------------------------------------ *
 * HMAC                                                               *
 * ------------------------------------------------------------------ */

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return subtle().importKey(
    'raw',
    encodeUtf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * HMAC-SHA256 over `message` using `secret`. Returns base64url.
 */
export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await subtle().sign('HMAC', key, encodeUtf8(message));
  return base64UrlEncode(new Uint8Array(sig));
}

/**
 * Verify an HMAC-SHA256 signature in constant time. Returns true on match.
 */
export async function hmacVerify(
  secret: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  try {
    return await subtle().verify('HMAC', key, base64UrlDecode(signature), encodeUtf8(message));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Worker → Platform request signing                                  *
 * ------------------------------------------------------------------ */

export interface WorkerRequestSignature {
  signature: string;
  timestamp: string;
}

/**
 * Build the canonical signing input for a Worker → Platform request.
 *
 * Format: `${method}\n${path}\n${bodyHash}\n${timestamp}`
 *
 * Spec v6 §6.3.
 */
export function buildWorkerSignatureInput(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
): string {
  return `${method.toUpperCase()}\n${path}\n${bodyHash}\n${timestamp}`;
}

/**
 * Sign a Worker → Platform request.
 *
 * @param secret  Shared HMAC secret (rotated dual-key)
 * @param method  HTTP method, uppercased
 * @param path    Request path including query string
 * @param body    Request body (string or Uint8Array). Pass empty string for GET.
 */
export async function signWorkerRequest(
  secret: string,
  method: string,
  path: string,
  body: string | Uint8Array,
): Promise<WorkerRequestSignature> {
  const timestamp = Date.now().toString();
  const bodyHash = await sha256Hex(body);
  const input = buildWorkerSignatureInput(method, path, bodyHash, timestamp);
  const signature = await hmacSign(secret, input);
  return { signature, timestamp };
}

/**
 * Verify a Worker → Platform request signature.
 *
 * Rejects requests older than HMAC_TIMESTAMP_TOLERANCE_MS (30s by default),
 * which provides anti-replay defense in addition to TLS.
 */
export async function verifyWorkerRequest(
  secret: string,
  method: string,
  path: string,
  body: string | Uint8Array,
  signature: string,
  timestamp: string,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(now - ts) > HMAC_TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, reason: 'timestamp out of tolerance' };
  }

  const bodyHash = await sha256Hex(body);
  const input = buildWorkerSignatureInput(method, path, bodyHash, timestamp);
  const ok = await hmacVerify(secret, input, signature);
  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

/* ------------------------------------------------------------------ *
 * iOS verify-kit HMAC                                                *
 * ------------------------------------------------------------------ */

/**
 * Build the canonical signing input for an iOS verify-kit callback.
 *
 * Format: `${app_id}|${signing_config_id}|${nonce}|${result}|${log_sha256}`
 *
 * Including `log_sha256` in the HMAC input binds the log to the signature:
 * a forged log changes the hash, breaking the HMAC.
 *
 * Spec v6 §13.5.
 */
export function buildVerifyKitSignatureInput(input: {
  app_id: string;
  signing_config_id: string;
  nonce: string;
  result: 'success' | 'failure';
  log_sha256: string;
}): string {
  return `${input.app_id}|${input.signing_config_id}|${input.nonce}|${input.result}|${input.log_sha256}`;
}

export async function signVerifyKitCallback(
  secret: string,
  input: Parameters<typeof buildVerifyKitSignatureInput>[0],
): Promise<string> {
  return hmacSign(secret, buildVerifyKitSignatureInput(input));
}

export async function verifyVerifyKitCallback(
  secret: string,
  input: Parameters<typeof buildVerifyKitSignatureInput>[0],
  signature: string,
): Promise<boolean> {
  return hmacVerify(secret, buildVerifyKitSignatureInput(input), signature);
}
