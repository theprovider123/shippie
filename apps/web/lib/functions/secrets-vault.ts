/**
 * AES-256-GCM secret vault for Shippie Functions.
 *
 * Secrets are encrypted at rest in Postgres using a platform-wide
 * master key (FUNCTIONS_MASTER_KEY env var, base64-encoded 32 bytes).
 *
 * Ciphertext format (base64 of the concatenation):
 *   [ iv (12 bytes) | ciphertext | auth tag (16 bytes) ]
 *
 * The key rotates by writing a new FUNCTIONS_MASTER_KEY and re-encrypting
 * every row inside a migration. One key per deployment environment.
 *
 * Spec v6 §1 (secrets never appear in build logs, are encrypted at rest).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadMasterKey(): Buffer {
  const raw = process.env.FUNCTIONS_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'FUNCTIONS_MASTER_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `FUNCTIONS_MASTER_KEY must decode to 32 bytes (got ${key.length}). Use openssl rand -base64 32.`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = loadMasterKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('ciphertext too short — corrupted or wrong format');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
