/**
 * X25519 ephemeral key exchange between WebRTC peers.
 *
 * Both ends generate a fresh X25519 keypair after the datachannel opens
 * and exchange public keys over the encrypted DTLS-protected channel.
 * Each side derives the shared secret with `deriveBits` and runs HKDF
 * to produce a symmetric AES-256-GCM key.
 *
 * The signal-DO never sees these keys — DTLS already encrypts the
 * channel, and the handshake runs *inside* it. The join code is purely
 * a rendezvous identifier; an attacker who knows the join code still
 * can't decrypt traffic without breaking DTLS or X25519.
 *
 * Web Crypto's `X25519` algorithm requires Chrome 124+ / Safari 17+ /
 * Firefox 137+. Where unavailable, we fall back to ECDH P-256 — a few
 * extra bytes on the wire and a marginally larger key, but the same
 * security level for our threat model.
 */

export interface HandshakeKeyPair {
  algorithm: 'X25519' | 'P-256';
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** Public key encoded as raw bytes (X25519) or SPKI (P-256). */
  publicKeyBytes: Uint8Array;
}

export interface HandshakeResult {
  /** AES-256-GCM key derived from the shared secret. */
  aesKey: CryptoKey;
  /** Algorithm used (the fallback path uses P-256). */
  algorithm: 'X25519' | 'P-256';
}

const HKDF_INFO = new TextEncoder().encode('shippie-proximity/aes-gcm/v1');

/**
 * Generate an ephemeral X25519 keypair (or P-256 fallback).
 */
export async function generateEphemeralKeyPair(): Promise<HandshakeKeyPair> {
  // Try X25519 first — preferred algorithm.
  try {
    const kp = (await crypto.subtle.generateKey(
      { name: 'X25519' } as unknown as EcKeyGenParams,
      true,
      ['deriveBits'],
    )) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return {
      algorithm: 'X25519',
      publicKey: kp.publicKey,
      privateKey: kp.privateKey,
      publicKeyBytes: raw,
    };
  } catch {
    // Fallthrough to P-256.
  }

  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  return {
    algorithm: 'P-256',
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicKeyBytes: spki,
  };
}

/**
 * Import a peer's public key bytes back into a CryptoKey.
 */
export async function importPeerPublicKey(
  algorithm: 'X25519' | 'P-256',
  bytes: Uint8Array,
): Promise<CryptoKey> {
  if (algorithm === 'X25519') {
    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'X25519' } as unknown as KeyAlgorithm,
      true,
      [],
    );
  }
  return crypto.subtle.importKey(
    'spki',
    bytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

/**
 * Complete the key exchange: combine our private key with the peer's
 * public key, run HKDF, and return an AES-256-GCM CryptoKey.
 *
 * `salt` should be deterministic from both peer ids (e.g.
 * `sha256(min(id1,id2) || max(id1,id2))`) so both sides arrive at the
 * same key without exchanging extra data.
 */
export async function deriveSharedAesKey(
  ours: HandshakeKeyPair,
  peerPublicKey: CryptoKey,
  salt: Uint8Array,
): Promise<HandshakeResult> {
  const algoName = ours.algorithm === 'X25519' ? 'X25519' : 'ECDH';
  const sharedBits = await crypto.subtle.deriveBits(
    { name: algoName, public: peerPublicKey } as unknown as EcdhKeyDeriveParams,
    ours.privateKey,
    256,
  );

  // HKDF expand into a 32-byte AES-256-GCM key.
  const ikm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: HKDF_INFO as BufferSource,
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { aesKey, algorithm: ours.algorithm };
}

/**
 * Deterministic salt for two peers given their stable ids. Sorting
 * before hashing means both sides compute the same salt without
 * exchanging it.
 */
export async function deriveHandshakeSalt(idA: string, idB: string): Promise<Uint8Array> {
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
  const buf = new TextEncoder().encode(`${lo}|${hi}`);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}
