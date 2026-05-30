/**
 * Trust Ledger crypto primitives.
 *
 * Device key:
 *   HKDF-SHA-256(vaultSeed, info='shippie/trust-ledger/device-v1') → 32
 *   bytes → non-extractable AES-GCM CryptoKey.
 *
 * Per-row envelope:
 *   AES-GCM with a fresh 12-byte IV per row. Plaintext is
 *   JSON.stringify(row). The {id, ts_bucket} fields stay outside the
 *   envelope so retention sweeps can run without decrypting.
 *
 * No key material ever leaves the crypto module — `key` is always
 * imported as non-extractable.
 */

import type { EncryptedLedgerRow, LedgerKey, LedgerRow } from './types.ts';

const HKDF_INFO_DEVICE_V1 = 'shippie/trust-ledger/device-v1';
const HKDF_SALT = new Uint8Array(0); // empty salt is acceptable per RFC 5869 when seed is high-entropy
const KEY_BITS = 256;
const IV_BYTES = 12;
const BUCKET_MS = 3_600_000; // 1 hour buckets — supports retention sweep

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('trust-ledger: Web Crypto SubtleCrypto unavailable in this runtime');
  }
  return globalThis.crypto.subtle;
}

function freshBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function toArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  if (input.buffer instanceof ArrayBuffer && input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
    return input as Uint8Array<ArrayBuffer>;
  }
  const out = freshBytes(input.byteLength);
  out.set(input);
  return out;
}

function encodeUtf8(input: string): Uint8Array<ArrayBuffer> {
  const view = new TextEncoder().encode(input);
  const out = freshBytes(view.byteLength);
  out.set(view);
  return out;
}

/**
 * Derive the device-scoped ledger key from Vault seed material.
 * Deterministic — same seed always derives the same key.
 */
export async function deriveDeviceLedgerKey(vaultSeed: Uint8Array): Promise<LedgerKey> {
  if (vaultSeed.byteLength < 16) {
    throw new RangeError('trust-ledger: vault seed must be ≥16 bytes');
  }
  const seedBytes = toArrayBufferBytes(vaultSeed);
  const seedKey = await subtle().importKey('raw', seedBytes, 'HKDF', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: encodeUtf8(HKDF_INFO_DEVICE_V1),
    },
    seedKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
  return { id: 'device-v1', key };
}

/**
 * Encrypt a ledger row. Throws on any crypto failure — callers must
 * treat that as a fail-closed condition per the failure policy.
 */
export async function encryptRow(key: LedgerKey, row: LedgerRow): Promise<EncryptedLedgerRow> {
  const iv = freshBytes(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const plaintext = encodeUtf8(JSON.stringify(row));
  const cipherBuffer = await subtle().encrypt({ name: 'AES-GCM', iv }, key.key, plaintext);
  return {
    id: row.id,
    ts_bucket: Math.floor(row.ts / BUCKET_MS),
    iv,
    ciphertext: new Uint8Array(cipherBuffer),
    key_id: key.id,
  };
}

/**
 * Decrypt a previously-encrypted row. Throws if the envelope was
 * produced under a different key id or the ciphertext is tampered.
 */
export async function decryptRow(key: LedgerKey, env: EncryptedLedgerRow): Promise<LedgerRow> {
  if (env.key_id !== key.id) {
    throw new Error(`trust-ledger: ciphertext key_id '${env.key_id}' does not match current key '${key.id}'`);
  }
  const ivBytes = toArrayBufferBytes(env.iv);
  const ctBytes = toArrayBufferBytes(env.ciphertext);
  const plainBuffer = await subtle().decrypt({ name: 'AES-GCM', iv: ivBytes }, key.key, ctBytes);
  const text = new TextDecoder().decode(plainBuffer);
  return JSON.parse(text) as LedgerRow;
}

export { BUCKET_MS };
