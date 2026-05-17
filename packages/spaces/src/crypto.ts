const DEFAULT_NONCE_BYTES = 12;

export async function deriveSpaceKey(secret: string, opts: { salt?: string; iterations?: number } = {}): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(opts.salt ?? 'shippie-space:v0');
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: opts.iterations ?? 80_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown, opts: { nonceBytes?: number } = {}): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const nonce = crypto.getRandomValues(new Uint8Array(opts.nonceBytes ?? DEFAULT_NONCE_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, bytes);
  const packed = new Uint8Array(nonce.byteLength + cipher.byteLength);
  packed.set(nonce, 0);
  packed.set(new Uint8Array(cipher), nonce.byteLength);
  return bytesToBase64(packed);
}

export async function decryptJson<T>(key: CryptoKey, payload: string, opts: { nonceBytes?: number } = {}): Promise<T> {
  const nonceBytes = opts.nonceBytes ?? DEFAULT_NONCE_BYTES;
  const packed = base64ToBytes(payload);
  if (packed.byteLength < nonceBytes + 16) throw new Error('encrypted frame too short');
  const nonce = packed.slice(0, nonceBytes);
  const ciphertext = packed.slice(nonceBytes);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function randomId(prefix = 'id', bytes = 12): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return `${prefix}_${bytesToBase64Url(arr)}`;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(padded);
}

export function stringToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

export function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

