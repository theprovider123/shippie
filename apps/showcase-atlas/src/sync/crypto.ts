/**
 * E2E AES-GCM for relay traffic. PBKDF2 derives a key from the room
 * passphrase (the human-readable code companions share), then every
 * Yjs update is encrypted with a fresh 12-byte nonce.
 *
 * Threat model:
 *  - Relay sees ciphertext + nonce only.
 *  - Anyone with the room passphrase can decrypt — that's by design;
 *    companions = people you trust to be on the trip with you.
 *  - Forward secrecy is not a goal; rotate by starting a new trip with
 *    a new code.
 */

const SALT = new TextEncoder().encode('shippie-atlas:e2e:v1');
const PBKDF2_ITERATIONS = 100_000;
const NONCE_BYTES = 12;

export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const codeBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    codeBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedFrame {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

export async function encrypt(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedFrame> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    key,
    toArrayBuffer(plaintext),
  );
  return { nonce, ciphertext: new Uint8Array(cipherBuf) };
}

export async function decrypt(key: CryptoKey, frame: EncryptedFrame): Promise<Uint8Array> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(frame.nonce) },
    key,
    toArrayBuffer(frame.ciphertext),
  );
  return new Uint8Array(plainBuf);
}

export function packFrame(frame: EncryptedFrame): Uint8Array {
  const out = new Uint8Array(NONCE_BYTES + frame.ciphertext.byteLength);
  out.set(frame.nonce, 0);
  out.set(frame.ciphertext, NONCE_BYTES);
  return out;
}

export function unpackFrame(bytes: Uint8Array): EncryptedFrame {
  if (bytes.byteLength < NONCE_BYTES + 16) throw new Error('frame too short');
  return {
    nonce: bytes.slice(0, NONCE_BYTES),
    ciphertext: bytes.slice(NONCE_BYTES),
  };
}
