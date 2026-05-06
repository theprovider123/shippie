/**
 * E2E encryption for relay traffic.
 *
 * The two phones derive an AES-GCM key from their shared pair code via
 * PBKDF2. Every Yjs update sent over the SignalRoom relay is encrypted
 * with a fresh random 12-byte nonce.
 *
 * Threat model:
 * - The relay sees ciphertext + nonce, NEVER plaintext.
 * - Anyone who knows the pair code (i.e. either phone) can decrypt.
 * - Knowing the room id alone is not enough — the room id is a hash of
 *   the pair code; the encryption key uses PBKDF2 with a different salt.
 * - Forward secrecy is NOT a goal here. Rotate by re-pairing.
 */

const SALT = new TextEncoder().encode('co-pilot:e2e:v1');
const PBKDF2_ITERATIONS = 100_000;
const NONCE_BYTES = 12;

export async function deriveKey(pairCode: string): Promise<CryptoKey> {
  const codeBytes = new TextEncoder().encode(pairCode);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    codeBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedFrame {
  /** 12-byte nonce as Uint8Array. */
  nonce: Uint8Array;
  /** AES-GCM ciphertext, includes 16-byte auth tag at the end. */
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

/** Wire format: [nonce(12) || ciphertext+tag]. */
export function packFrame(frame: EncryptedFrame): Uint8Array {
  const out = new Uint8Array(NONCE_BYTES + frame.ciphertext.byteLength);
  out.set(frame.nonce, 0);
  out.set(frame.ciphertext, NONCE_BYTES);
  return out;
}

export function unpackFrame(bytes: Uint8Array): EncryptedFrame {
  if (bytes.byteLength < NONCE_BYTES + 16) {
    throw new Error('frame too short');
  }
  return {
    nonce: bytes.slice(0, NONCE_BYTES),
    ciphertext: bytes.slice(NONCE_BYTES),
  };
}
