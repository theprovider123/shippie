/**
 * Cloudflare scheduled-event dispatcher.
 *
 * The Worker entry's `scheduled()` handler delegates here. Each cron string
 * routes to one or more idempotent handlers. Errors are logged but don't
 * abort the dispatch — the runtime will fire the next cron on schedule.
 *
 * Schedules port 1:1 from vercel.json (see Phase 7 of the refactor plan):
 *
 *   *\/5 * * * *   reconcile-kv
 *   0 * * * *     reap-trials + rollups (both fire on the hour)
 *   0 4 * * *     retention (daily 4am UTC)
 */
import type { ScheduledController } from '@cloudflare/workers-types';
import { reconcileKv } from './reconcile-kv';
import { reapTrials } from './reap-trials';
import { rollups } from './rollups';
import { retention } from './retention';

export interface CronEnv {
  DB: import('@cloudflare/workers-types').D1Database;
  CACHE: import('@cloudflare/workers-types').KVNamespace;
}

export async function handleScheduled(
  controller: ScheduledController,
  env: CronEnv,
): Promise<void> {
  const cron = controller.cron;
  console.log(`[cron] firing cron='${cron}' scheduled_time=${controller.scheduledTime}`);

  try {
    switch (cron) {
      case '*/5 * * * *': {
        await reconcileKv(env);
        return;
      }
      case '0 * * * *': {
        // Both reap-trials and rollups fire on the hour.
        const settled = await Promise.allSettled([reapTrials(env), rollups(env)]);
        for (const r of settled) {
          if (r.status === 'rejected') {
            console.error('[cron] hourly handler rejected', r.reason);
          }
        }
        return;
      }
      case '0 4 * * *': {
        await retention(env);
        return;
      }
      default: {
        console.warn(`[cron] unknown cron string '${cron}' — no handler matched`);
      }
    }
  } catch (err) {
    console.error(`[cron] dispatcher error for '${cron}':`, err);
  }
}
