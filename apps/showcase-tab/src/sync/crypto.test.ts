import { describe, expect, test } from 'bun:test';
import { decrypt, deriveKey, encrypt, packFrame, unpackFrame } from './crypto.ts';

describe('crypto — PBKDF2 + AES-GCM round-trip', () => {
  test('encrypt / decrypt round-trips a payload', async () => {
    const key = await deriveKey('FRESH-OLIVE-BREAD');
    const plaintext = new TextEncoder().encode('table for four');
    const frame = await encrypt(key, plaintext);
    const recovered = await decrypt(key, frame);
    expect(new TextDecoder().decode(recovered)).toBe('table for four');
  });

  test('different phrases derive different keys (decrypt fails)', async () => {
    const k1 = await deriveKey('FRESH-OLIVE-BREAD');
    const k2 = await deriveKey('SHARP-LEMON-WINE');
    const frame = await encrypt(k1, new Uint8Array([1, 2, 3, 4]));
    await expect(decrypt(k2, frame)).rejects.toThrow();
  });

  test('packFrame / unpackFrame is inverse', async () => {
    const key = await deriveKey('TEST-PHRASE-X');
    const frame = await encrypt(key, new Uint8Array([9, 8, 7, 6, 5]));
    const packed = packFrame(frame);
    const unpacked = unpackFrame(packed);
    expect(Array.from(unpacked.nonce)).toEqual(Array.from(frame.nonce));
    expect(Array.from(unpacked.ciphertext)).toEqual(Array.from(frame.ciphertext));
    const recovered = await decrypt(key, unpacked);
    expect(Array.from(recovered)).toEqual([9, 8, 7, 6, 5]);
  });

  test('unpackFrame rejects too-short input', () => {
    expect(() => unpackFrame(new Uint8Array(8))).toThrow(/frame too short/);
  });

  test('nonces are unique across encryptions', async () => {
    const key = await deriveKey('TEST-PHRASE-X');
    const f1 = await encrypt(key, new Uint8Array([1]));
    const f2 = await encrypt(key, new Uint8Array([1]));
    expect(Array.from(f1.nonce)).not.toEqual(Array.from(f2.nonce));
  });
});
