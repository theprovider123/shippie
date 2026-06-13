/**
 * End-to-end crypto for cross-device handoff (Layer 2).
 *
 * Same envelope the sealed-access relay uses: ECDH P-256 → HKDF-free
 * AES-256-GCM. The recipient (laptop) keeps its private key local and
 * only ever publishes its public key; the sender (phone) derives the
 * shared key from its own private key + the recipient's public key, so
 * the relay only ever sees two public keys + ciphertext and can never
 * read the snapshot.
 *
 * Browser + Node (vitest) both expose `crypto.subtle`, so this module is
 * isomorphic and unit-testable without a DOM.
 */

const ALG = 'ECDH-P256-AES-256-GCM' as const;

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '==='.slice((padded.length + 3) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// TS 5.7 types Uint8Array as Uint8Array<ArrayBufferLike>, which doesn't
// satisfy BufferSource (it wants an ArrayBuffer-backed view). The bytes
// here are always ArrayBuffer-backed; this narrows the type for subtle.
function buf(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

export interface HandoffKeyPair {
  /** base64url-encoded SPKI public key — safe to publish through the relay. */
  publicKeyB64: string;
  /** Stays on the device; never serialized. */
  privateKey: CryptoKey;
}

export interface HandoffCipher {
  nonce: string;
  ciphertext: string;
  alg: typeof ALG;
}

export async function generateHandoffKeyPair(): Promise<HandoffKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return { publicKeyB64: b64urlEncode(spki), privateKey: pair.privateKey };
}

async function deriveAesKey(privateKey: CryptoKey, peerPublicKeyB64: string): Promise<CryptoKey> {
  const peerPublic = await crypto.subtle.importKey(
    'spki',
    buf(b64urlDecode(peerPublicKeyB64)),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublic },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Sender side: encrypt a JSON payload to the recipient's public key. */
export async function encryptHandoffPayload(
  senderPrivateKey: CryptoKey,
  recipientPublicKeyB64: string,
  payload: unknown,
): Promise<HandoffCipher> {
  const key = await deriveAesKey(senderPrivateKey, recipientPublicKeyB64);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(plaintext));
  return { nonce: b64urlEncode(nonce), ciphertext: b64urlEncode(ciphertext), alg: ALG };
}

/** Recipient side: decrypt with the local private key + sender's public key. */
export async function decryptHandoffPayload<T = unknown>(
  recipientPrivateKey: CryptoKey,
  senderPublicKeyB64: string,
  cipher: { nonce: string; ciphertext: string },
): Promise<T> {
  const key = await deriveAesKey(recipientPrivateKey, senderPublicKeyB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(b64urlDecode(cipher.nonce)) },
    key,
    buf(b64urlDecode(cipher.ciphertext)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export { ALG as HANDOFF_ALG };
