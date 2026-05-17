import type { D1Database } from '@cloudflare/workers-types';

export type MagicLinkRateLimitResult =
  | { ok: true; remaining: number; retryAfterMs: 0 }
  | { ok: false; remaining: 0; retryAfterMs: number };

interface RateRow {
  count: number;
  reset_at: string;
}

export async function checkMagicLinkRateLimit(input: {
  db: D1Database;
  request: Request;
  email: string;
  now?: Date;
}): Promise<MagicLinkRateLimitResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  const ip = clientIp(input.request);
  const checks = await Promise.all([
    increment(input.db, `auth:magic:ip:${await digest(ip)}`, 20, 15 * 60_000, now),
    increment(input.db, `auth:magic:email:${await digest(email)}`, 5, 15 * 60_000, now),
    increment(input.db, `auth:magic:pair:${await digest(`${ip}|${email}`)}`, 3, 5 * 60_000, now),
  ]);
  const blocked = checks.filter((check) => !check.ok);
  if (blocked.length > 0) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(...blocked.map((b) => b.retryAfterMs)) };
  }
  return { ok: true, remaining: Math.min(...checks.map((c) => c.remaining)), retryAfterMs: 0 };
}

async function increment(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
  now: Date,
): Promise<MagicLinkRateLimitResult> {
  const nowIso = now.toISOString();
  const resetIso = new Date(now.getTime() + windowMs).toISOString();
  const row = await db
    .prepare(
      `INSERT INTO auth_rate_limits ("key", "count", "reset_at", "updated_at")
       VALUES (?, 1, ?, ?)
       ON CONFLICT("key") DO UPDATE SET
         "count" = CASE
           WHEN auth_rate_limits."reset_at" <= ? THEN 1
           ELSE auth_rate_limits."count" + 1
         END,
         "reset_at" = CASE
           WHEN auth_rate_limits."reset_at" <= ? THEN excluded."reset_at"
           ELSE auth_rate_limits."reset_at"
         END,
         "updated_at" = excluded."updated_at"
       RETURNING "count", "reset_at"`,
    )
    .bind(key, resetIso, nowIso, nowIso, nowIso)
    .first<RateRow>();
  const count = Number(row?.count ?? limit + 1);
  if (count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(1000, Date.parse(row?.reset_at ?? resetIso) - now.getTime()) };
  }
  return { ok: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
}

function clientIp(request: Request): string {
  const cf = (request as Request & { cf?: { connectingIP?: string } }).cf;
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? cf?.connectingIP ?? 'local';
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
