import { describe, expect, test } from 'bun:test';
import { SHIPPIE_BACKUP_MAGIC } from '@shippie/local-runtime-contract';
import { decodeEncryptedBackup, encodeEncryptedBackup, unpackBackup } from './backup.ts';

describe('@shippie/local-db backup format', () => {
  test('packs and decrypts encrypted shippiebak payloads', async () => {
    const plaintext = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    const encoded = await encodeEncryptedBackup({
      appId: 'app-1',
      schemaVersion: 2,
      tables: ['recipes'],
      plaintext,
      passphrase: 'correct horse battery staple',
    });

    expect(encoded.blob.type).toBe('application/vnd.shippie.backup');
    expect(encoded.header.appId).toBe('app-1');
    expect(encoded.header.tables).toEqual(['recipes']);

    const unpacked = await unpackBackup(encoded.blob);
    expect(unpacked.header.appId).toBe('app-1');
    expect(unpacked.header.schemaVersion).toBe(2);

    const decoded = await decodeEncryptedBackup(encoded.blob, 'correct horse battery staple');
    expect(new TextDecoder().decode(decoded.plaintext)).toBe('{"hello":"world"}');
  });

  test('rejects non-shippie backups', async () => {
    const blob = new Blob([new TextEncoder().encode('NOT' + SHIPPIE_BACKUP_MAGIC)]);
    try {
      await unpackBackup(blob);
      throw new Error('expected unpackBackup to fail');
    } catch (err) {
      expect((err as Error).message).toContain('Invalid Shippie backup');
    }
  });
});
