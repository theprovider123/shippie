/**
 * reap-trials cron — runs hourly.
 *
 * Archives trial apps whose 24h TTL has elapsed. Drops their active KV
 * pointer so the wrapper stops serving them. R2 artifacts linger until
 * a separate sweeper GC's them.
 *
 * Idempotent: archived apps are skipped on the next pass.
 */
import { and, eq, lt } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface ReapTrialsEnv {
  DB: D1Database;
  CACHE: KVNamespace;
}

export interface ReapTrialsResult {
  archived: number;
  slugs: string[];
  errors: Array<{ slug: string; reason: string }>;
}

const PAGE_SIZE = 200;

export async function reapTrials(env: ReapTrialsEnv): Promise<ReapTrialsResult> {
  const db = getDrizzleClient(env.DB);
  const now = new Date().toISOString();
  const result: ReapTrialsResult = { archived: 0, slugs: [], errors: [] };

  const expired = await db
    .select({ id: schema.apps.id, slug: schema.apps.slug })
    .from(schema.apps)
    .where(
      and(
        eq(schema.apps.isTrial, true),
        eq(schema.apps.isArchived, false),
        lt(schema.apps.trialUntil, now),
      ),
    )
    .limit(PAGE_SIZE);

  for (const row of expired) {
    try {
      await db
        .update(schema.apps)
        .set({
          isArchived: true,
          takedownReason: 'trial_expired',
          updatedAt: now,
        })
        .where(eq(schema.apps.id, row.id));

      try {
        await env.CACHE.delete(`apps:${row.slug}:active`);
      } catch {
        // best-effort — TTL or next pass will retry
      }

      result.archived += 1;
      result.slugs.push(row.slug);
    } catch (err) {
      result.errors.push({ slug: row.slug, reason: (err as Error).message });
    }
  }

  console.log(
    `[cron:reap-trials] archived=${result.archived} errors=${result.errors.length}`,
  );
  return result;
}
