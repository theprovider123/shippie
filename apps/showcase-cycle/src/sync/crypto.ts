/**
 * E2E encryption for the partner relay.
 *
 * Two phones derive an AES-GCM key from a shared pair code via PBKDF2.
 * Every Yjs update sent over the relay is encrypted with a fresh random
 * 12-byte nonce. The relay sees ciphertext + nonce only.
 *
 * This is the canonical 2-party crypto pattern from showcase-mevrouw,
 * lifted into Cycle so both showcases stay independent. Key rotation
 * means re-pairing — fine for the threat model, since a leaked pair
 * code retroactively exposes everything that ever moved through it.
 *
 * Forward secrecy is NOT a goal here.
 */

const SALT = new TextEncoder().encode('cycle-local:e2e:v1');
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
  if (bytes.byteLength < NONCE_BYTES + 16) {
    throw new Error('frame too short');
  }
  return {
    nonce: bytes.slice(0, NONCE_BYTES),
    ciphertext: bytes.slice(NONCE_BYTES),
  };
}

/**
 * Room id derived from the pair code. The relay sees this; it's a hash
 * so the relay can't reverse-derive the code. Different salt to the
 * encryption key, so room id ≠ key material.
 */
export function roomIdFor(pairCode: string): string {
  let h = 5381;
  for (let i = 0; i < pairCode.length; i++) {
    h = ((h << 5) + h) ^ pairCode.charCodeAt(i);
  }
  return `cycle-${(h >>> 0).toString(36)}`;
}

/**
 * Generate a human-readable pair code: ADJECTIVE-NOUN-NNNN. Same shape
 * as the mevrouw pairing code so users get a consistent vocabulary
 * across showcases.
 */
const ADJECTIVES = ['TENDER', 'GOLDEN', 'SOFT', 'WARM', 'BRIGHT', 'GENTLE', 'QUIET', 'KIND'] as const;
const NOUNS = ['CRANE', 'WILLOW', 'EMBER', 'TIDE', 'MEADOW', 'COTTON', 'HONEY', 'LANTERN'] as const;

export function generatePairCode(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${n}-${num}`;
}
