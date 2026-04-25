import { describe, expect, test } from 'bun:test';
import {
  deriveHandshakeSalt,
  deriveSharedAesKey,
  generateEphemeralKeyPair,
  importPeerPublicKey,
} from './handshake.ts';

describe('handshake', () => {
  test('two peers derive the same AES key', async () => {
    const a = await generateEphemeralKeyPair();
    const b = await generateEphemeralKeyPair();
    expect(a.algorithm).toBe(b.algorithm);

    const salt = await deriveHandshakeSalt('peer-a', 'peer-b');

    const bPubAtA = await importPeerPublicKey(a.algorithm, b.publicKeyBytes);
    const aPubAtB = await importPeerPublicKey(b.algorithm, a.publicKeyBytes);

    const aSide = await deriveSharedAesKey(a, bPubAtA, salt);
    const bSide = await deriveSharedAesKey(b, aPubAtB, salt);

    // Encrypt with a's key, decrypt with b's key — round-trip proves equivalence.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aSide.aesKey,
      new TextEncoder().encode('hello mesh'),
    );
    const pt = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, bSide.aesKey, ct),
    );
    expect(new TextDecoder().decode(pt)).toBe('hello mesh');
  });

  test('different peers → different keys', async () => {
    const a = await generateEphemeralKeyPair();
    const b = await generateEphemeralKeyPair();
    const c = await generateEphemeralKeyPair();
    const salt = await deriveHandshakeSalt('a', 'b');

    const bPub = await importPeerPublicKey(a.algorithm, b.publicKeyBytes);
    const cPub = await importPeerPublicKey(a.algorithm, c.publicKeyBytes);

    const ab = await deriveSharedAesKey(a, bPub, salt);
    const ac = await deriveSharedAesKey(a, cPub, salt);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      ab.aesKey,
      new TextEncoder().encode('test'),
    );
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, ac.aesKey, ct),
    ).rejects.toThrow();
  });

  test('salt is deterministic regardless of argument order', async () => {
    const s1 = await deriveHandshakeSalt('peer-a', 'peer-b');
    const s2 = await deriveHandshakeSalt('peer-b', 'peer-a');
    expect(Array.from(s1)).toEqual(Array.from(s2));
  });
});
