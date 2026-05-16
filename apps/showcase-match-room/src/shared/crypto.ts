const SALT = new TextEncoder().encode('shippie-matchday:relay:v1');
const NONCE_BYTES = 12;

export async function deriveRoomKey(secret: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 80_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, bytes);
  const packed = new Uint8Array(NONCE_BYTES + cipher.byteLength);
  packed.set(nonce, 0);
  packed.set(new Uint8Array(cipher), NONCE_BYTES);
  return toBase64(packed);
}

export async function decryptJson<T>(key: CryptoKey, payload: string): Promise<T> {
  const packed = fromBase64(payload);
  if (packed.byteLength < NONCE_BYTES + 16) throw new Error('encrypted frame too short');
  const nonce = packed.slice(0, NONCE_BYTES);
  const ciphertext = packed.slice(NONCE_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
