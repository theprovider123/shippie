import { describe, expect, test } from 'vitest';
import {
  decryptHandoffPayload,
  encryptHandoffPayload,
  generateHandoffKeyPair,
} from './handoff-crypto';

describe('handoff crypto', () => {
  test('sender→recipient round-trips a JSON payload', async () => {
    const recipient = await generateHandoffKeyPair();
    const sender = await generateHandoffKeyPair();
    const payload = { schema: 'shippie.handoff.v1', dock: ['palate', 'golazo'], n: 7 };

    const cipher = await encryptHandoffPayload(sender.privateKey, recipient.publicKeyB64, payload);
    expect(cipher.alg).toBe('ECDH-P256-AES-256-GCM');
    expect(cipher.nonce).toMatch(/^[A-Za-z0-9_-]+$/);

    const decrypted = await decryptHandoffPayload(recipient.privateKey, sender.publicKeyB64, cipher);
    expect(decrypted).toEqual(payload);
  });

  test('a different recipient key cannot decrypt', async () => {
    const recipient = await generateHandoffKeyPair();
    const intruder = await generateHandoffKeyPair();
    const sender = await generateHandoffKeyPair();
    const cipher = await encryptHandoffPayload(sender.privateKey, recipient.publicKeyB64, { x: 1 });
    await expect(
      decryptHandoffPayload(intruder.privateKey, sender.publicKeyB64, cipher),
    ).rejects.toThrow();
  });

  test('tampered ciphertext fails the GCM tag', async () => {
    const recipient = await generateHandoffKeyPair();
    const sender = await generateHandoffKeyPair();
    const cipher = await encryptHandoffPayload(sender.privateKey, recipient.publicKeyB64, { x: 1 });
    const tampered = { ...cipher, ciphertext: cipher.ciphertext.slice(0, -2) + (cipher.ciphertext.endsWith('A') ? 'B' : 'A') };
    await expect(
      decryptHandoffPayload(recipient.privateKey, sender.publicKeyB64, tampered),
    ).rejects.toThrow();
  });
});
