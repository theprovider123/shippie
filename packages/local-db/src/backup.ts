import {
  SHIPPIE_BACKUP_MAGIC,
  SHIPPIE_BACKUP_VERSION,
  type ShippieBackupHeader,
} from '@shippie/local-runtime-contract';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;

export interface EncodedBackup {
  blob: Blob;
  header: ShippieBackupHeader;
}

export async function encodeEncryptedBackup(input: {
  appId: string;
  schemaVersion: number;
  tables: string[];
  plaintext: Uint8Array;
  passphrase: string;
}): Promise<EncodedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await deriveAesKey(input.passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(nonce) }, key, toArrayBuffer(input.plaintext)),
  );
  const contentHash = await sha256Hex(input.plaintext);
  const header: ShippieBackupHeader = {
    appId: input.appId,
    schemaVersion: input.schemaVersion,
    createdAt: new Date().toISOString(),
    kdf: 'PBKDF2-SHA256',
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    tables: input.tables,
    contentHash,
  };
  return {
    blob: packBackup(header, ciphertext),
    header,
  };
}

export async function decodeEncryptedBackup(blob: Blob, passphrase: string): Promise<{
  header: ShippieBackupHeader;
  plaintext: Uint8Array;
}> {
  const { header, ciphertext } = await unpackBackup(blob);
  const key = await deriveAesKey(passphrase, base64ToBytes(header.salt));
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(header.nonce)) },
      key,
      toArrayBuffer(ciphertext),
    ),
  );
  const hash = await sha256Hex(plaintext);
  if (hash !== header.contentHash) throw new Error('Backup content hash mismatch');
  return { header, plaintext };
}

export function packBackup(header: ShippieBackupHeader, ciphertext: Uint8Array): Blob {
  const magic = encoder.encode(SHIPPIE_BACKUP_MAGIC);
  const version = new Uint8Array([SHIPPIE_BACKUP_VERSION]);
  const headerBytes = encoder.encode(JSON.stringify(header));
  const headerLength = new Uint8Array(4);
  new DataView(headerLength.buffer).setUint32(0, headerBytes.byteLength, false);
  return new Blob([
    toArrayBuffer(magic),
    toArrayBuffer(version),
    toArrayBuffer(headerLength),
    toArrayBuffer(headerBytes),
    toArrayBuffer(ciphertext),
  ], {
    type: 'application/vnd.shippie.backup',
  });
}

export async function unpackBackup(blob: Blob): Promise<{
  header: ShippieBackupHeader;
  ciphertext: Uint8Array;
}> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const magicBytes = encoder.encode(SHIPPIE_BACKUP_MAGIC);
  if (bytes.byteLength < magicBytes.byteLength + 5) throw new Error('Invalid Shippie backup');
  const magic = decoder.decode(bytes.slice(0, magicBytes.byteLength));
  if (magic !== SHIPPIE_BACKUP_MAGIC) throw new Error('Invalid Shippie backup magic');
  const version = bytes[magicBytes.byteLength];
  if (version !== SHIPPIE_BACKUP_VERSION) {
    throw new Error(`Unsupported Shippie backup version: ${version}`);
  }
  const headerOffset = magicBytes.byteLength + 1;
  const headerLength = new DataView(
    bytes.buffer,
    bytes.byteOffset + headerOffset,
    4,
  ).getUint32(0, false);
  const headerStart = headerOffset + 4;
  const headerEnd = headerStart + headerLength;
  const header = JSON.parse(decoder.decode(bytes.slice(headerStart, headerEnd))) as ShippieBackupHeader;
  return {
    header,
    ciphertext: bytes.slice(headerEnd),
  };
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
