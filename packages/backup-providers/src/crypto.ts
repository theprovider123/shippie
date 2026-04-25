/**
 * Crypto helpers — thin wrappers around `@shippie/local-db/backup`.
 *
 * The local-db package already implements Argon2id-equivalent KDF
 * (PBKDF2-SHA256 at 210k iterations in this build) + AES-256-GCM for
 * its own backup format. We delegate to it for both directions so the
 * on-disk and over-the-wire ciphertexts share one tested code path.
 *
 * NEVER add a "log" parameter that includes the passphrase or token
 * here. The whole point of this module is that secrets stay in memory.
 */
import {
  encodeEncryptedBackup,
  decodeEncryptedBackup,
} from '@shippie/local-db';

export interface EncryptInput {
  appSlug: string;
  schemaVersion: number;
  tables: string[];
  plaintext: Uint8Array;
  passphrase: string;
}

export interface EncryptedBlob {
  /** AES-GCM ciphertext + Shippie envelope. */
  bytes: Uint8Array;
  /** Suggested filename for the cloud provider. */
  fileName: string;
  /** ISO timestamp baked into the envelope. */
  createdAt: string;
}

export async function encryptBackup(input: EncryptInput): Promise<EncryptedBlob> {
  const encoded = await encodeEncryptedBackup({
    appId: input.appSlug,
    schemaVersion: input.schemaVersion,
    tables: input.tables,
    plaintext: input.plaintext,
    passphrase: input.passphrase,
  });
  const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
  const iso = encoded.header.createdAt;
  // Filename format from the spec: shippie-backup-{slug}-{ISO date}.enc
  // We strip seconds-precision to keep the filename URL-safe and short.
  const date = iso.replace(/[:.]/g, '-');
  return {
    bytes,
    fileName: `shippie-backup-${input.appSlug}-${date}.enc`,
    createdAt: iso,
  };
}

export async function decryptBackup(
  ciphertext: Uint8Array,
  passphrase: string,
): Promise<{ plaintext: Uint8Array; appSlug: string; createdAt: string }> {
  const blob = new Blob([toArrayBuffer(ciphertext)]);
  const { plaintext, header } = await decodeEncryptedBackup(blob, passphrase);
  return {
    plaintext,
    appSlug: header.appId,
    createdAt: header.createdAt,
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
