import { describe, expect, test } from 'bun:test';
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  decryptEnvelope,
  encryptEnvelope,
  generateSigningKeyPair,
  importPeerSigningKey,
} from './encryption.ts';

async function genAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

describe('encryption envelope', () => {
  test('round-trip encrypt + decrypt + signature verify', async () => {
    const aes = await genAesKey();
    const signer = await generateSigningKeyPair();
    const env = await encryptEnvelope({
      aesKey: aes,
      signing: signer,
      channel: 'chat',
      payload: { hello: 'mesh', n: 42 },
    });
    expect(env.from).toBe(signer.peerId);
    expect(env.channel).toBe('chat');

    const out = await decryptEnvelope<{ hello: string; n: number }>({
      aesKey: aes,
      envelope: env,
      resolveVerifier: async (peerId) => {
        expect(peerId).toBe(signer.peerId);
        return importPeerSigningKey(peerId);
      },
    });
    expect(out).toEqual({ hello: 'mesh', n: 42 });
  });

  test('rejects tampered ciphertext', async () => {
    const aes = await genAesKey();
    const signer = await generateSigningKeyPair();
    const env = await encryptEnvelope({
      aesKey: aes,
      signing: signer,
      channel: 'chat',
      payload: 'hello',
    });
    const tampered = base64ToBytes(env.c);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    env.c = bytesToBase64(tampered);

    await expect(
      decryptEnvelope({
        aesKey: aes,
        envelope: env,
        resolveVerifier: (id) => importPeerSigningKey(id),
      }),
    ).rejects.toThrow();
  });

  test('rejects forged sender (wrong peer pubkey advertised)', async () => {
    const aes = await genAesKey();
    const real = await generateSigningKeyPair();
    const fake = await generateSigningKeyPair();
    const env = await encryptEnvelope({
      aesKey: aes,
      signing: real,
      channel: 'chat',
      payload: 'truth',
    });
    // Maliciously rewrite `from` to fake.peerId. The signature still
    // belongs to real, so verification under fake's key must fail.
    env.from = fake.peerId;
    await expect(
      decryptEnvelope({
        aesKey: aes,
        envelope: env,
        resolveVerifier: (id) => importPeerSigningKey(id),
      }),
    ).rejects.toThrow(/signature/);
  });

  test('rejects when AES key does not match sender', async () => {
    const aes1 = await genAesKey();
    const aes2 = await genAesKey();
    const signer = await generateSigningKeyPair();
    const env = await encryptEnvelope({
      aesKey: aes1,
      signing: signer,
      channel: 'chat',
      payload: 'hi',
    });
    await expect(
      decryptEnvelope({
        aesKey: aes2,
        envelope: env,
        resolveVerifier: (id) => importPeerSigningKey(id),
      }),
    ).rejects.toThrow();
  });
});

describe('base64 helpers', () => {
  test('round-trips arbitrary bytes', () => {
    const raw = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 17]);
    const enc = bytesToBase64(raw);
    const dec = base64ToBytes(enc);
    expect(Array.from(dec)).toEqual(Array.from(raw));
  });

  test('base64url round-trips and is URL safe', () => {
    const raw = new Uint8Array([0xff, 0xfb, 0xfa, 0x00, 0x10]);
    const enc = bytesToBase64Url(raw);
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    expect(enc).not.toContain('=');
    const dec = base64UrlToBytes(enc);
    expect(Array.from(dec)).toEqual(Array.from(raw));
  });
});
