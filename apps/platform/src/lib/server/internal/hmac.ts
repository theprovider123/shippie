/**
 * HMAC-SHA256 helpers for inbound webhook verification.
 *
 * Used by:
 *   - /api/v1/deploy/callback     (signature from GH Actions runner via WORKER_PLATFORM_SECRET)
 *   - /api/v1/webhook/github      (signature from GitHub via GITHUB_WEBHOOK_SECRET)
 *
 * Web Crypto only — no node:crypto so this runs in Workers.
 */

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0');
  return s;
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Constant-time comparison of two equal-length hex strings.
 * Returns false on length mismatch.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a `sha256=<hex>` style signature header against a raw body.
 * Accepts both `sha256=...` and bare hex.
 */
export async function verifySha256Signature(
  secret: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = await hmacSha256Hex(secret, body);
  const provided = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
  return timingSafeEqualHex(expected, provided);
}
