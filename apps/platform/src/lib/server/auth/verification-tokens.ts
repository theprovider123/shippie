/**
 * HMAC-signed verification tokens for magic-link sign-in.
 *
 * Token shape: `<payloadB64Url>.<sigB64Url>` where payload is the JSON-encoded
 * `{email, exp, jti}` triple. Verification:
 *  - HMAC-SHA-256 over the raw payload bytes with AUTH_SECRET
 *  - exp must be in the future
 *  - jti must exist in `verification_tokens` and be unused (single-use)
 *
 * The DB row uses `identifier=email`, `token=jti`, `expires=ISO timestamp`.
 * On redemption we DELETE the row to mark it consumed (the migration's
 * primary key is (identifier, token), no `used` boolean needed — absence
 * means consumed).
 */
import type { D1Database } from '@cloudflare/workers-types';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const ENCODER = new TextEncoder();

export interface MintInput {
  email: string;
  authSecret: string;
  db: D1Database;
}

export interface MintResult {
  token: string;
  expiresAt: Date;
}

export interface VerifyInput {
  token: string;
  authSecret: string;
  db: D1Database;
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid_format' | 'bad_signature' | 'expired' | 'unknown_or_used' };

interface Payload {
  email: string;
  exp: number; // ms since epoch
  jti: string;
}

/** Mint a fresh single-use magic-link token, persisting the jti. */
export async function mintVerificationToken({ email, authSecret, db }: MintInput): Promise<MintResult> {
  const expMs = Date.now() + TOKEN_TTL_MS;
  const jti = randomHex(16);
  const payload: Payload = { email, exp: expMs, jti };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(ENCODER.encode(payloadJson));
  const sig = await hmacSha256(authSecret, payloadJson);
  const sigB64 = b64urlEncode(sig);
  const token = `${payloadB64}.${sigB64}`;

  // Persist the jti — `verification_tokens` has identifier+token PK.
  await db
    .prepare(
      'INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)',
    )
    .bind(email, jti, new Date(expMs).toISOString())
    .run();

  return { token, expiresAt: new Date(expMs) };
}

/** Verify a magic-link token. Single-use: success consumes the row. */
export async function verifyAndConsumeToken({ token, authSecret, db }: VerifyInput): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid_format' };
  const [payloadB64, sigB64] = parts;
  let payload: Payload;
  try {
    const payloadJson = new TextDecoder().decode(b64urlDecode(payloadB64));
    payload = JSON.parse(payloadJson) as Payload;
    const expectedSig = await hmacSha256(authSecret, payloadJson);
    const actualSig = b64urlDecode(sigB64);
    if (!constantTimeEqual(expectedSig, actualSig)) {
      return { ok: false, reason: 'bad_signature' };
    }
  } catch {
    return { ok: false, reason: 'invalid_format' };
  }

  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  // Atomic-ish consume: DELETE returns the row count via D1 meta.
  const result = await db
    .prepare('DELETE FROM verification_tokens WHERE identifier = ? AND token = ?')
    .bind(payload.email, payload.jti)
    .run();

  // D1 returns `meta.changes` as the rows-deleted count.
  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  if (changes === 0) {
    return { ok: false, reason: 'unknown_or_used' };
  }

  return { ok: true, email: payload.email };
}

// ---- helpers ----

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(message));
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
