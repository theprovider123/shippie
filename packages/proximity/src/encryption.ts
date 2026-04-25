/**
 * AES-256-GCM message envelopes signed with Ed25519.
 *
 * - Symmetric key comes from `handshake.ts` (derived per peer-pair).
 * - Sender signs `iv || ciphertext` with their long-term Ed25519 key.
 * - Receiver verifies the signature, then decrypts.
 *
 * Why both encrypt and sign? Encryption alone is anonymous (any group
 * member could have produced the message). Signing binds the message
 * to the sender's stable identity so eventLog ordering and group
 * moderation can attribute messages.
 *
 * Web Crypto Ed25519 needs Chrome 113+ / Safari 17+ / Firefox 130+.
 * No fallback — we'd lose authenticity against tampering by other
 * group members. If a future low-end Android target needs ECDSA
 * fallback we'll add it then.
 */
import type { EncryptedEnvelope, PeerId } from './types.ts';

export interface SigningKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** Stable peer id = base64url of raw Ed25519 public key. */
  peerId: PeerId;
}

export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const kp = (await crypto.subtle.generateKey(
    { name: 'Ed25519' } as unknown as Algorithm,
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    peerId: bytesToBase64Url(raw),
  };
}

export async function importPeerSigningKey(peerId: PeerId): Promise<CryptoKey> {
  const raw = base64UrlToBytes(peerId);
  return crypto.subtle.importKey(
    'raw',
    asArrayBuffer(raw),
    { name: 'Ed25519' } as unknown as Algorithm,
    true,
    ['verify'],
  );
}

export interface EncryptOpts {
  aesKey: CryptoKey;
  signing: SigningKeyPair;
  channel: string;
  payload: unknown;
}

export async function encryptEnvelope(opts: EncryptOpts): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(opts.payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv) },
      opts.aesKey,
      asArrayBuffer(plaintext),
    ),
  );
  // Sign iv || ct
  const toSign = concat(iv, ct);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' } as unknown as Algorithm,
      opts.signing.privateKey,
      asArrayBuffer(toSign),
    ),
  );
  return {
    c: bytesToBase64(ct),
    iv: bytesToBase64(iv),
    sig: bytesToBase64(sig),
    from: opts.signing.peerId,
    channel: opts.channel,
  };
}

export interface DecryptOpts {
  aesKey: CryptoKey;
  envelope: EncryptedEnvelope;
  /**
   * Verifier hook — receives the sender peerId, returns a CryptoKey to
   * verify the signature with. Throw to reject (e.g. unknown peer).
   */
  resolveVerifier: (peerId: PeerId) => Promise<CryptoKey>;
}

export async function decryptEnvelope<T = unknown>(opts: DecryptOpts): Promise<T> {
  const { envelope } = opts;
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.c);
  const sig = base64ToBytes(envelope.sig);
  const toVerify = concat(iv, ct);
  const verifier = await opts.resolveVerifier(envelope.from);
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' } as unknown as Algorithm,
    verifier,
    asArrayBuffer(sig),
    asArrayBuffer(toVerify),
  );
  if (!ok) throw new Error('encryption: signature verification failed');

  const pt = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv) },
      opts.aesKey,
      asArrayBuffer(ct),
    ),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/**
 * Detach a Uint8Array view into a fresh ArrayBuffer so Web Crypto's
 * BufferSource typing (which requires `ArrayBuffer`, not the looser
 * `ArrayBufferLike`) is satisfied. Always copies a small amount of data
 * so nothing here is hot-path.
 */
function asArrayBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

// --------------------------------------------------------------------
// b64 helpers — tiny, no deps. base64 for envelope fields, base64url for
// peer ids (URL-safe).
// --------------------------------------------------------------------

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(b: Uint8Array): string {
  return bytesToBase64(b).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function base64UrlToBytes(s: string): Uint8Array {
  let t = s.replaceAll('-', '+').replaceAll('_', '/');
  const pad = t.length % 4;
  if (pad === 2) t += '==';
  else if (pad === 3) t += '=';
  else if (pad === 1) throw new Error('base64UrlToBytes: invalid length');
  return base64ToBytes(t);
}
