/**
 * No-signup trial deploy helpers.
 *
 * Visitors drop a zip on the landing page; we create a time-boxed deploy
 * under a reserved `trial-*` slug, owned by the synthetic trial maker
 * seeded in migration 0011. After 24h the reaper archives the app and
 * removes the KV pointer.
 *
 * Differentiation plan Pillar B2.
 */
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { DevKv, getDevKvDir } from '@shippie/dev-storage';

export const TRIAL_SLUG_PREFIX = 'trial-';
export const TRIAL_MAKER_ID = '00000000-0000-0000-0000-000000000001';
export const TRIAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TRIAL_MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50MB
export const TRIAL_PER_IP_LIMIT = 3; // deploys per hour per IP

/** Generate a random trial-xxxxxxxx slug. Very low collision rate at small N. */
export function generateTrialSlug(): string {
  return TRIAL_SLUG_PREFIX + randomBytes(4).toString('hex');
}

export function hashIp(ip: string): string {
  const salt = process.env.TRIAL_IP_SALT ?? 'shippie-trial-default-salt';
  return createHash('sha256').update(salt).update(ip).digest('hex');
}

/**
 * Check how many trial deploys the given IP has made in the last hour.
 */
export async function countRecentTrialsForIp(ipHash: string): Promise<number> {
  const db = await getDb();
  const rows = (await db.execute(sql`
    select count(*)::int as count
    from apps
    where is_trial = true
      and trial_ip_hash = ${ipHash}
      and created_at > now() - interval '1 hour'
  `)) as unknown as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

export function trialUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_TTL_MS);
}

/**
 * Reaper: archive any trial apps that have passed their TTL. Returns
 * the number of apps archived. Called from /api/internal/reap-trials
 * on a cron schedule (hourly is plenty).
 */
export interface ReapResult {
  archived: number;
  slugs: string[];
}

export async function reapExpiredTrials(): Promise<ReapResult> {
  const db = await getDb();
  const kv = new DevKv(getDevKvDir());

  const expired = await db
    .select({ id: schema.apps.id, slug: schema.apps.slug })
    .from(schema.apps)
    .where(
      and(
        eq(schema.apps.isTrial, true),
        eq(schema.apps.isArchived, false),
        lt(schema.apps.trialUntil, new Date()),
      ),
    );

  const slugs: string[] = [];
  for (const row of expired) {
    await db
      .update(schema.apps)
      .set({
        isArchived: true,
        takedownReason: 'trial_expired',
        updatedAt: new Date(),
      })
      .where(eq(schema.apps.id, row.id));

    // Best-effort: drop the KV active pointer so the worker stops serving.
    // The R2 artifacts linger for a grace period; a separate sweeper can GC them.
    try {
      await kv.delete(`apps:${row.slug}:active`);
    } catch {
      // KV delete not fatal — next cron run will retry if it comes back
    }

    slugs.push(row.slug);
  }

  return { archived: expired.length, slugs };
}
