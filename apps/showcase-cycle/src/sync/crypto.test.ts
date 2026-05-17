import { describe, expect, it } from 'bun:test';
import { decrypt, deriveKey, encrypt, generatePairCode, packFrame, roomIdFor, unpackFrame } from './crypto.ts';

describe('crypto', () => {
  it('roundtrips encrypt/decrypt with a derived key', async () => {
    const key = await deriveKey('TENDER-CRANE-3849');
    const plaintext = new TextEncoder().encode('hello partner');
    const frame = await encrypt(key, plaintext);
    const back = await decrypt(key, frame);
    expect(new TextDecoder().decode(back)).toBe('hello partner');
  });

  it('different pair codes derive different keys (decrypt fails)', async () => {
    const aliceKey = await deriveKey('TENDER-CRANE-3849');
    const malloryKey = await deriveKey('TENDER-CRANE-9999');
    const plaintext = new TextEncoder().encode('hello partner');
    const frame = await encrypt(aliceKey, plaintext);
    let threw = false;
    try {
      await decrypt(malloryKey, frame);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('packFrame + unpackFrame is lossless', async () => {
    const key = await deriveKey('GOLDEN-WILLOW-1111');
    const frame = await encrypt(key, new Uint8Array([1, 2, 3, 4, 5]));
    const packed = packFrame(frame);
    const back = unpackFrame(packed);
    expect(back.nonce).toEqual(frame.nonce);
    expect(back.ciphertext).toEqual(frame.ciphertext);
  });

  it('roomIdFor is deterministic per pair code', () => {
    expect(roomIdFor('TENDER-CRANE-3849')).toBe(roomIdFor('TENDER-CRANE-3849'));
    expect(roomIdFor('TENDER-CRANE-3849')).not.toBe(roomIdFor('TENDER-CRANE-3850'));
  });

  it('generatePairCode produces ADJ-NOUN-NNNN', () => {
    const code = generatePairCode();
    expect(code).toMatch(/^[A-Z]+-[A-Z]+-\d{4}$/);
  });
});
