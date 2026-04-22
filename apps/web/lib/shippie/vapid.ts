// apps/web/lib/shippie/vapid.ts
/**
 * VAPID JWT signing and aes128gcm payload encryption for Web Push.
 *
 * Spec refs:
 *   - RFC 8292: VAPID — application server identification via ES256 JWT.
 *   - RFC 8188: Encrypted Content-Encoding — aes128gcm.
 *   - RFC 8291: Message Encryption for Web Push.
 *
 * Uses @noble/curves/nist (p256) for ECDSA (ES256) + ECDH, and
 * @noble/hashes for HKDF. WebCrypto is available at runtime
 * (Next.js Node runtime) and we use it for AES-GCM via `crypto.subtle`.
 */
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

export interface VapidJwtInput {
  audience: string;
  subject: string;
  expiresInSeconds: number;
}

/**
 * Sign a VAPID JWT (RFC 8292) using ES256 over P-256.
 *
 * `privateKey` is the raw 32-byte P-256 scalar (as @noble/curves returns
 * from `p256.keygen().secretKey`).
 */
export async function signVapidJwt(
  input: VapidJwtInput,
  privateKey: Uint8Array,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: input.audience,
    sub: input.subject,
    exp: now + input.expiresInSeconds,
  };
  const headerB64 = b64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);
  // JWS ES256 requires the raw r||s compact encoding (64 bytes), not DER.
  const sig = p256.sign(signingInput, privateKey, { format: 'compact' });
  return `${headerB64}.${payloadB64}.${b64urlEncode(sig)}`;
}

export interface PushTarget {
  endpoint: string;
  keys: {
    p256dh: string; // base64url, uncompressed 65-byte P-256 public key (0x04||x||y)
    auth: string;   // base64url, 16-byte shared auth secret
  };
}

/**
 * aes128gcm-encrypt a payload for a Push subscription per RFC 8291.
 *
 * Output layout (RFC 8188 §2.1 header + body):
 *   [salt(16) | rs(4, BE=4096) | idlen(1=65) | key_id(65, uncompressed EC) | ciphertext...]
 */
export async function encryptPayloadAes128gcm(
  target: PushTarget,
  payload: Uint8Array,
): Promise<Uint8Array> {
  // 1. Generate an ephemeral P-256 key pair for this message.
  const ephemeral = p256.keygen();
  const ephemeralPubUncompressed = p256.getPublicKey(ephemeral.secretKey, false); // 65 bytes, 0x04||x||y

  // 2. ECDH: derive shared secret with UA's public key.
  //    @noble/curves' getSharedSecret with isCompressed=true returns 33 bytes
  //    (0x02||x or 0x03||x). Web Push (RFC 8291) wants the raw 32-byte x-coord.
  const uaPubBytes = b64urlDecode(target.keys.p256dh);
  const sharedCompressed = p256.getSharedSecret(ephemeral.secretKey, uaPubBytes, true);
  const ikm = sharedCompressed.slice(1, 33); // 32 bytes of x-coord

  const authSecret = b64urlDecode(target.keys.auth);

  // 3. Random 16-byte salt for this message.
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // 4. RFC 8291 §3.4 — derive the per-message IKM:
  //    PRK_key = HKDF(salt=auth_secret, IKM=ECDH, info="WebPush: info\0"||ua_pub||app_pub, L=32)
  const keyInfo = concat(
    encoder.encode('WebPush: info\0'),
    uaPubBytes,
    ephemeralPubUncompressed,
  );
  const ikmForContent = hkdf(sha256, ikm, authSecret, keyInfo, 32);

  // 5. RFC 8188 — derive content-encryption key + nonce from the message salt.
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const cek = hkdf(sha256, ikmForContent, salt, cekInfo, 16);
  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
  const nonce = hkdf(sha256, ikmForContent, salt, nonceInfo, 12);

  // 6. Pad per RFC 8188 §2 — single 0x02 byte marks "last record". Phase 4
  //    payloads are tiny (<< 4079 bytes), so no multi-record splitting needed.
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload);
  padded[payload.length] = 0x02;

  // 7. AES-128-GCM encrypt. The 16-byte auth tag is appended by SubtleCrypto.
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded),
  );

  // 8. Emit the RFC 8188 header followed by ciphertext.
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer, 16, 4).setUint32(0, 4096, false);
  header[20] = 65;
  header.set(ephemeralPubUncompressed, 21);

  return concat(header, ciphertext);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
