/**
 * Share blob format — the load-bearing wire shape.
 *
 * A ShareBlob is a self-contained, signed payload carrying one piece of
 * shareable content (a recipe, a journal entry, a memory) plus author
 * metadata + lineage + an ECDSA P-256 signature. Recipients can verify
 * tamper-resistance and surface "from <author>" if they recognise the
 * pubkey from a prior import.
 *
 * Canonical encoding (for signing + hashing): JSON.stringify with the
 * `sig` field omitted and keys sorted alphabetically. Deterministic.
 */

export interface ShareAuthor {
  /** Base64url-encoded SPKI public key (ECDSA P-256). */
  pubkey: string;
  /** Optional display name set by the author. */
  name?: string;
}

export interface ShareLineage {
  /** sha256 (base64url, first 16 bytes) of the parent blob's canonical encoding. */
  parent_hash?: string;
  /** Free-form provenance hint. */
  based_on?: string;
}

/**
 * v1 share blob. The `payload` is opaque to this package — each
 * consumer (recipe, journal, memory) defines its own payload schema
 * keyed off `type`.
 */
export interface ShareBlob<TPayload = unknown> {
  v: 1;
  type: string;
  payload: TPayload;
  author: ShareAuthor;
  created_at: number;
  lineage?: ShareLineage;
  /** Base64url ECDSA P-256 signature over the canonical encoding. */
  sig: string;
}

export interface UnsignedBlob<TPayload = unknown>
  extends Omit<ShareBlob<TPayload>, 'sig'> {}

export type VerifyResult =
  | { valid: true; blob: ShareBlob }
  | { valid: false; blob: ShareBlob; reason: 'tampered' | 'malformed' | 'verifier_unavailable' };

/**
 * Stable JSON encoding with sorted keys. Used for signing + hashing.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`,
  );
  return `{${pairs.join(',')}}`;
}

/** Bytes to base64url string. */
export function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url string to bytes. */
export function base64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  // Avoid SharedArrayBuffer typing issues — copy into a fresh ArrayBuffer.
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

/**
 * Hash a payload's canonical encoding. Used for lineage parent_hash.
 * Returns a base64url string of the first 16 bytes (truncated for
 * compactness — collision space is still 2^128).
 */
export async function hashCanonical(value: unknown): Promise<string> {
  const enc = new TextEncoder().encode(canonicalize(value));
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(enc));
  return bytesToBase64url(new Uint8Array(digest).slice(0, 16));
}

/**
 * Sign an unsigned blob with the author's ECDSA P-256 private key.
 * The signature covers the canonical encoding of all blob fields
 * except `sig` itself.
 */
export async function signBlob(
  unsigned: UnsignedBlob,
  privateKey: CryptoKey,
): Promise<ShareBlob> {
  const canonical = canonicalize(unsigned);
  const bytes = new TextEncoder().encode(canonical);
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    toArrayBuffer(bytes),
  );
  return { ...unsigned, sig: bytesToBase64url(new Uint8Array(sigBuf)) };
}

/**
 * Verify a signed blob. The author's pubkey lives inside the blob;
 * we reconstruct it as a CryptoKey, then verify the signature against
 * the canonical encoding.
 */
export async function verifyBlob(blob: ShareBlob): Promise<VerifyResult> {
  if (blob.v !== 1 || !blob.sig || !blob.author?.pubkey) {
    return { valid: false, blob, reason: 'malformed' };
  }
  let pubkey: CryptoKey;
  try {
    const spki = base64urlToBytes(blob.author.pubkey);
    pubkey = await crypto.subtle.importKey(
      'spki',
      toArrayBuffer(spki),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return { valid: false, blob, reason: 'malformed' };
  }
  const { sig: _sig, ...unsigned } = blob;
  const canonical = canonicalize(unsigned);
  const bytes = new TextEncoder().encode(canonical);
  let ok = false;
  try {
    const sig = base64urlToBytes(blob.sig);
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubkey,
      toArrayBuffer(sig),
      toArrayBuffer(bytes),
    );
  } catch {
    return { valid: false, blob, reason: 'verifier_unavailable' };
  }
  return ok
    ? { valid: true, blob }
    : { valid: false, blob, reason: 'tampered' };
}
