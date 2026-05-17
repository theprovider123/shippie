import { describe, expect, test } from 'bun:test';
import {
  decrypt,
  deriveKey,
  encrypt,
  packFrame,
  unpackFrame,
} from './crypto.ts';

describe('crypto — PBKDF2 + AES-GCM', () => {
  test('round-trip: encrypt then decrypt returns the original plaintext', async () => {
    const key = await deriveKey('BIRCH-NORTH-3849');
    const original = new TextEncoder().encode('a handover note nobody else should read');
    const frame = await encrypt(key, original);
    const out = await decrypt(key, frame);
    expect(new TextDecoder().decode(out)).toBe('a handover note nobody else should read');
  });

  test('different pair codes derive different keys (decrypt fails)', async () => {
    const keyA = await deriveKey('BIRCH-NORTH-3849');
    const keyB = await deriveKey('CALM-PATH-1000');
    const original = new TextEncoder().encode('secret');
    const frame = await encrypt(keyA, original);
    let threw = false;
    try {
      await decrypt(keyB, frame);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('packFrame and unpackFrame are inverse', async () => {
    const key = await deriveKey('BIRCH-NORTH-3849');
    const original = new TextEncoder().encode('hello');
    const frame = await encrypt(key, original);
    const packed = packFrame(frame);
    const unpacked = unpackFrame(packed);
    expect(unpacked.nonce.byteLength).toBe(12);
    expect(unpacked.nonce).toEqual(frame.nonce);
    expect(unpacked.ciphertext).toEqual(frame.ciphertext);
  });

  test('unpackFrame on a too-short buffer throws', () => {
    expect(() => unpackFrame(new Uint8Array(4))).toThrow();
  });
});
