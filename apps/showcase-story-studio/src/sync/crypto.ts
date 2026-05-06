/**
 * E2E encryption for the parent ↔ grandparent relay channel.
 *
 * PBKDF2 → AES-GCM, 100k iterations, 12-byte nonce. Identical shape
 * to apps/showcase-mevrouw/src/sync/crypto.ts but with a Story
 * Studio-specific salt — even if a family reuses the same couple
 * code (they shouldn't, but humans), the key for stories is
 * cryptographically distinct from the couple key.
 *
 * Threat model:
 * - The signal relay sees ciphertext + nonce, never plaintext.
 * - Anyone with the family code (parent + grandparent phones) can
 *   decrypt. Forward secrecy is not a goal — re-pair to rotate.
 */

const SALT = new TextEncoder().encode('story-studio:e2e:v1');
const PBKDF2_ITERATIONS = 100_000;
const NONCE_BYTES = 12;

export async function deriveKey(familyCode: string): Promise<CryptoKey> {
  const codeBytes = new TextEncoder().encode(familyCode);
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

/** Wire format: [nonce(12) || ciphertext+tag] for cheap framing. */
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
