import { describe, expect, test } from 'bun:test';
import {
  signVapidJwt,
  encryptPayloadAes128gcm,
  type PushTarget,
} from './vapid.ts';
import { p256 } from '@noble/curves/p256';

describe('signVapidJwt', () => {
  test('produces a 3-part dot-separated JWT', async () => {
    const { secretKey } = p256.keygen();
    const jwt = await signVapidJwt(
      {
        audience: 'https://fcm.googleapis.com',
        subject: 'mailto:ops@shippie.app',
        expiresInSeconds: 3600,
      },
      secretKey,
    );
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    expect(header.typ).toBe('JWT');
    expect(header.alg).toBe('ES256');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    expect(payload.aud).toBe('https://fcm.googleapis.com');
    expect(payload.sub).toBe('mailto:ops@shippie.app');
    expect(typeof payload.exp).toBe('number');
  });

  test('signature verifies with the corresponding public key', async () => {
    const { publicKey, secretKey } = p256.keygen();
    const jwt = await signVapidJwt(
      {
        audience: 'https://example.push',
        subject: 'mailto:x@example.com',
        expiresInSeconds: 60,
      },
      secretKey,
    );
    const [h, p, sig] = jwt.split('.');
    const signingInput = new TextEncoder().encode(`${h}.${p}`);
    const sigBytes = Buffer.from(sig!, 'base64url');
    const ok = p256.verify(sigBytes, signingInput, publicKey);
    expect(ok).toBe(true);
  });
});

describe('encryptPayloadAes128gcm', () => {
  test('produces a ciphertext with the expected 86-byte header layout', async () => {
    const { publicKey: uaPub } = p256.keygen();
    const authSecret = new Uint8Array(16);
    crypto.getRandomValues(authSecret);
    const target: PushTarget = {
      endpoint: 'https://push.example/abc',
      keys: {
        p256dh: Buffer.from(uaPub).toString('base64url'),
        auth: Buffer.from(authSecret).toString('base64url'),
      },
    };
    const payload = new TextEncoder().encode('{"title":"hi"}');
    const ciphertext = await encryptPayloadAes128gcm(target, payload);
    // First 16 bytes are the salt, then 4-byte rs (BE uint32 = 4096),
    // then 1-byte idlen = 65, then 65-byte ephemeral key.
    expect(ciphertext.length).toBeGreaterThan(86);
    const rs = new DataView(ciphertext.buffer, ciphertext.byteOffset + 16, 4).getUint32(0, false);
    expect(rs).toBe(4096);
    expect(ciphertext[20]).toBe(65);
    // Key-id byte 21 should be 0x04 (uncompressed EC point marker).
    expect(ciphertext[21]).toBe(0x04);
  });

  test('different payloads produce different ciphertexts (salt randomizes)', async () => {
    const { publicKey: uaPub } = p256.keygen();
    const target: PushTarget = {
      endpoint: 'https://push.example/abc',
      keys: {
        p256dh: Buffer.from(uaPub).toString('base64url'),
        auth: Buffer.from(new Uint8Array(16)).toString('base64url'),
      },
    };
    const a = await encryptPayloadAes128gcm(target, new TextEncoder().encode('a'));
    const b = await encryptPayloadAes128gcm(target, new TextEncoder().encode('a'));
    // Salt is random, so ciphertexts diverge even for identical payloads.
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
