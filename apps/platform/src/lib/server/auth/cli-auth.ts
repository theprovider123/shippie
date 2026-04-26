/**
 * CLI / MCP OAuth 2.0 Device Authorization Grant helpers — D1 port.
 *
 * Mirrors apps/web/lib/cli-auth.ts (Postgres+Drizzle) but operates directly
 * against the D1 binding via prepared statements. Same response shapes,
 * same token format, so existing CLI binaries that POST to
 * /api/auth/cli/{device,poll,whoami,approve} keep working.
 *
 * Token format: `shpe_<64 hex chars>` (32 random bytes). Stored in
 * cli_tokens.token_hash as SHA-256 hex.
 */
import type { D1Database } from '@cloudflare/workers-types';

export const DEVICE_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const DEVICE_POLL_INTERVAL_SEC = 1;

export interface CreateDeviceCodeInput {
  clientName: string;
  scopes?: string[];
  baseUrl: string;
  db: D1Database;
}

export interface CreateDeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

/** Friendly 8-char code displayed to the user, like "BCDF-GHJK". */
function generateUserCode(): string {
  const pick = () => {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length]).join('');
  };
  return `${pick()}-${pick()}`;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createDeviceCode(input: CreateDeviceCodeInput): Promise<CreateDeviceCodeResult> {
  const deviceCode = randomHex(32);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  await input.db
    .prepare(
      `INSERT INTO cli_device_codes (device_code, user_code, client_name, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(deviceCode, userCode, input.clientName, JSON.stringify(input.scopes ?? []), expiresAt.toISOString())
    .run();

  const root = input.baseUrl.replace(/\/$/, '');
  return {
    deviceCode,
    userCode,
    verificationUri: `${root}/auth/cli/activate`,
    verificationUriComplete: `${root}/auth/cli/activate?user_code=${encodeURIComponent(userCode)}`,
    expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
    interval: DEVICE_POLL_INTERVAL_SEC,
  };
}

export type PollOutcome =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'already_consumed' }
  | { status: 'approved'; accessToken: string; userId: string };

interface DeviceRow {
  device_code: string;
  user_code: string;
  user_id: string | null;
  client_name: string;
  scopes: string;
  approved_at: string | null;
  expires_at: string;
  consumed_at: string | null;
}

/** Exchange an approved device code for a bearer token (single-use). */
export async function exchangeDeviceCode(deviceCode: string, db: D1Database): Promise<PollOutcome> {
  const row = await db
    .prepare('SELECT * FROM cli_device_codes WHERE device_code = ? LIMIT 1')
    .bind(deviceCode)
    .first<DeviceRow>();

  if (!row) return { status: 'not_found' };
  if (row.consumed_at) return { status: 'already_consumed' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: 'expired' };
  if (!row.approved_at || !row.user_id) return { status: 'pending' };

  const rawToken = `shpe_${randomHex(32)}`;
  const tokenHash = await hashToken(rawToken);

  // Mint cli_tokens row + mark device code consumed. D1 supports batch().
  await db.batch([
    db
      .prepare(
        `INSERT INTO cli_tokens (id, user_id, token_hash, client_name, scopes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), row.user_id, tokenHash, row.client_name, row.scopes),
    db
      .prepare('UPDATE cli_device_codes SET consumed_at = ? WHERE device_code = ?')
      .bind(new Date().toISOString(), deviceCode),
  ]);

  return { status: 'approved', accessToken: rawToken, userId: row.user_id };
}

/** Bind a user_code to the currently signed-in user. */
export async function approveDeviceCode(input: {
  userCode: string;
  userId: string;
  db: D1Database;
}): Promise<{ ok: true; clientName: string } | { ok: false; reason: string }> {
  const row = await input.db
    .prepare('SELECT * FROM cli_device_codes WHERE user_code = ? LIMIT 1')
    .bind(input.userCode)
    .first<DeviceRow>();

  if (!row) return { ok: false, reason: 'invalid_code' };
  if (row.consumed_at) return { ok: false, reason: 'already_used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.approved_at && row.user_id && row.user_id !== input.userId) {
    return { ok: false, reason: 'already_bound_to_other_user' };
  }

  await input.db
    .prepare('UPDATE cli_device_codes SET user_id = ?, approved_at = ? WHERE device_code = ?')
    .bind(input.userId, new Date().toISOString(), row.device_code)
    .run();

  return { ok: true, clientName: row.client_name };
}

interface CliTokenRow {
  id: string;
  user_id: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/** Validate a Bearer token. Returns the userId on success. */
export async function authenticateBearer(
  authorizationHeader: string | null,
  db: D1Database,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!authorizationHeader) return null;
  const trimmed = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
  if (!trimmed) return null;

  const tokenHash = await hashToken(trimmed);
  const row = await db
    .prepare('SELECT id, user_id, expires_at, revoked_at FROM cli_tokens WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<CliTokenRow>();

  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  // Best-effort last_used_at. Don't await — if it fails, the request still
  // succeeds. (Workers don't have ctx.waitUntil here without plumbing.)
  db.prepare('UPDATE cli_tokens SET last_used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.id)
    .run()
    .catch(() => {
      /* ignore */
    });

  return { userId: row.user_id, tokenId: row.id };
}
