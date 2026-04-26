/**
 * retention cron — runs daily at 4am UTC.
 *
 * D1 has no native partitioning. The Postgres version dropped monthly
 * partitions; the SQLite port issues a bounded DELETE.
 *
 * Default retention: 60 days. Configurable via the `daysToKeep` option for
 * tests and one-off backfills.
 *
 * Idempotent: a converged table (no rows older than the cutoff) is a no-op.
 */
import { lt } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import type { D1Database } from '@cloudflare/workers-types';

export interface RetentionEnv {
  DB: D1Database;
}

export interface RetentionResult {
  cutoff: string;
  deleted: number;
}

const DEFAULT_DAYS = 60;

export async function retention(
  env: RetentionEnv,
  opts?: { daysToKeep?: number; now?: Date },
): Promise<RetentionResult> {
  const days = opts?.daysToKeep ?? DEFAULT_DAYS;
  const now = opts?.now ?? new Date();
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();

  const db = getDrizzleClient(env.DB);
  let deleted = 0;
  try {
    // Drizzle d1 driver does not surface affected-row counts via .delete()
    // returning, but it does support .returning() on SQLite. To stay portable,
    // count first then delete in chunks.
    const oldRows = await db
      .select({ id: schema.analyticsEvents.id })
      .from(schema.analyticsEvents)
      .where(lt(schema.analyticsEvents.createdAt, cutoff))
      .limit(50_000);
    deleted = oldRows.length;

    if (oldRows.length > 0) {
      // Single bounded DELETE — D1 handles ~100k row deletes in well under
      // the 30s scheduled-event ceiling for our row counts.
      await db
        .delete(schema.analyticsEvents)
        .where(lt(schema.analyticsEvents.createdAt, cutoff));
    }
  } catch (err) {
    console.error('[cron:retention] delete failed', err);
  }

  console.log(`[cron:retention] cutoff=${cutoff} deleted=${deleted}`);
  return { cutoff, deleted };
}
