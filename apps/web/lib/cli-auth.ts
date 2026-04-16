/**
 * CLI / MCP OAuth 2.0 Device Authorization Grant helpers.
 *
 * Spec: RFC 8628 (Device Authorization Grant) simplified for single-user
 * usage. No public client registration — every device code is anonymous
 * until a signed-in user approves it.
 *
 * Tables: cli_device_codes, cli_tokens (migration 0012).
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';

// Device codes expire after 15 minutes of inactivity.
export const DEVICE_CODE_TTL_MS = 15 * 60 * 1000;

// CLI polls once per second; we enforce 1s minimum between polls.
export const DEVICE_POLL_INTERVAL_SEC = 1;

export interface CreateDeviceCodeInput {
  clientName: string;
  scopes?: string[];
}

export interface CreateDeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

/** Generate a friendly 8-character user code (e.g. "ABCD-EFGH"). */
function generateUserCode(): string {
  // Avoid 0/O/1/I for legibility
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ23456789';
  const pick = () => {
    const bytes = randomBytes(4);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  };
  return `${pick()}-${pick()}`;
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.SHIPPIE_BASE_URL ?? 'https://shippie.app';
}

export async function createDeviceCode(
  input: CreateDeviceCodeInput,
): Promise<CreateDeviceCodeResult> {
  const db = await getDb();
  const deviceCode = randomBytes(32).toString('hex');
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  await db.insert(schema.cliDeviceCodes).values({
    deviceCode,
    userCode,
    clientName: input.clientName,
    scopes: input.scopes ?? [],
    expiresAt,
  });

  const root = baseUrl();
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

/**
 * Exchange an approved device code for a bearer token. Consumes the row
 * on success so the token is only emitted once.
 */
export async function exchangeDeviceCode(deviceCode: string): Promise<PollOutcome> {
  const db = await getDb();
  const row = await db.query.cliDeviceCodes.findFirst({
    where: eq(schema.cliDeviceCodes.deviceCode, deviceCode),
  });

  if (!row) return { status: 'not_found' };
  if (row.consumedAt) return { status: 'already_consumed' };
  if (row.expiresAt.getTime() < Date.now()) return { status: 'expired' };
  if (!row.approvedAt || !row.userId) return { status: 'pending' };

  // Mint the bearer and mark the device code consumed.
  const rawToken = `shpe_${randomBytes(32).toString('hex')}`;
  const tokenHash = hashToken(rawToken);

  await db.insert(schema.cliTokens).values({
    userId: row.userId,
    tokenHash,
    clientName: row.clientName,
    scopes: row.scopes,
  });

  await db
    .update(schema.cliDeviceCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.cliDeviceCodes.deviceCode, deviceCode));

  return { status: 'approved', accessToken: rawToken, userId: row.userId };
}

/**
 * Approve a device code by matching user_code, binding it to the currently
 * signed-in user. Called from the /auth/cli/activate browser flow.
 */
export async function approveDeviceCode(input: {
  userCode: string;
  userId: string;
}): Promise<{ ok: true; clientName: string } | { ok: false; reason: string }> {
  const db = await getDb();
  const row = await db.query.cliDeviceCodes.findFirst({
    where: eq(schema.cliDeviceCodes.userCode, input.userCode),
  });

  if (!row) return { ok: false, reason: 'invalid_code' };
  if (row.consumedAt) return { ok: false, reason: 'already_used' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.approvedAt && row.userId && row.userId !== input.userId) {
    return { ok: false, reason: 'already_bound_to_other_user' };
  }

  await db
    .update(schema.cliDeviceCodes)
    .set({ userId: input.userId, approvedAt: new Date() })
    .where(eq(schema.cliDeviceCodes.deviceCode, row.deviceCode));

  return { ok: true, clientName: row.clientName };
}

/**
 * Validate a bearer token presented in an Authorization header.
 * Returns the user id on success, null otherwise. Updates last_used_at
 * as a side effect so the dashboard can show token activity.
 */
export async function authenticateBearer(token: string | null): Promise<{ userId: string } | null> {
  if (!token) return null;
  const trimmed = token.replace(/^Bearer\s+/i, '').trim();
  if (!trimmed) return null;

  const db = await getDb();
  const tokenHash = hashToken(trimmed);
  const rows = (await db.execute(sql`
    select id, user_id as "userId", expires_at as "expiresAt", revoked_at as "revokedAt"
    from cli_tokens where token_hash = ${tokenHash} limit 1
  `)) as unknown as Array<{ id: string; userId: string; expiresAt: Date | null; revokedAt: Date | null }>;

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Best-effort update — never block the request on this
  db.update(schema.cliTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.cliTokens.id, row.id))
    .catch(() => {
      /* ignore */
    });

  return { userId: row.userId };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Safety sweeper. Drops device codes whose TTL expired and were never
 * consumed. Called from the hourly cron container.
 */
export async function reapExpiredDeviceCodes(): Promise<number> {
  const db = await getDb();
  const result = (await db.execute(sql`
    delete from cli_device_codes
    where consumed_at is null and expires_at < now()
    returning device_code
  `)) as unknown as Array<{ device_code: string }>;
  return result.length;
}

/**
 * Unified auth: accepts either the Auth.js session cookie (browser users)
 * or a Bearer CLI token (terminal + MCP users). Returns { userId } or null.
 *
 * Deploy routes use this instead of `await auth()` alone so that
 * `shippie deploy` works without browser sessions.
 */
export async function resolveUserId(request: {
  headers: { get(name: string): string | null };
}): Promise<{ userId: string } | null> {
  // Bearer token path — cheaper than session lookup, try first
  const bearer = await authenticateBearer(request.headers.get('authorization'));
  if (bearer) return bearer;

  // Fall back to Auth.js session. Imported lazily to keep this module
  // loadable outside a Next.js request context (e.g. cron helpers).
  const { auth } = await import('./auth/index.ts');
  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id };

  return null;
}
