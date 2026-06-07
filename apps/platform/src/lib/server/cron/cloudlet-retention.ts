/**
 * cloudlet-retention cron — runs daily at 4am UTC alongside the platform
 * retention sweep (Phase 9).
 *
 * For every NON-erased private-app instance, opens its SchoolWorkspace DO and
 * calls the deterministic `applyRetention()` (purges raw feedback note text
 * older than the school's configured `retention_notes_months`; aggregates are
 * always kept). Each school's policy lives WITH its data as a workspace
 * setting, so this sweep is just the scheduler — the decision is per-school.
 *
 * Idempotent + best-effort per school: one school's failure never aborts the
 * sweep. No-op when SCHOOL_WORKSPACE is unbound (so it never breaks an env that
 * doesn't run Uniti).
 */
import { isNull } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';

export interface CloudletRetentionEnv {
  DB: D1Database;
  SCHOOL_WORKSPACE?: DurableObjectNamespace;
}

export interface CloudletRetentionResult {
  schools: number;
  notesPurged: number;
  skipped: boolean;
}

export async function cloudletRetention(
  env: CloudletRetentionEnv,
): Promise<CloudletRetentionResult> {
  if (!env.SCHOOL_WORKSPACE) {
    return { schools: 0, notesPurged: 0, skipped: true };
  }
  const db = getDrizzleClient(env.DB);
  const instances = await db
    .select({ id: schema.privateAppInstances.id })
    .from(schema.privateAppInstances)
    .where(isNull(schema.privateAppInstances.erasedAt));

  let notesPurged = 0;
  for (const inst of instances) {
    try {
      const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${inst.id}`);
      const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as {
        applyRetention: () => Promise<{ notesPurged: number; cutoff: number | null }>;
      };
      const res = await stub.applyRetention();
      notesPurged += res.notesPurged;
    } catch (err) {
      console.error(`[cron:cloudlet-retention] school=${inst.id} failed`, err);
    }
  }

  console.log(
    `[cron:cloudlet-retention] schools=${instances.length} notesPurged=${notesPurged}`,
  );
  return { schools: instances.length, notesPurged, skipped: false };
}
