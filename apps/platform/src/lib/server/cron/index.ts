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
import { capabilityBadges } from './capability-badges';
import { kindRollup } from './kind-rollup';

export interface CronEnv {
  DB: import('@cloudflare/workers-types').D1Database;
  CACHE: import('@cloudflare/workers-types').KVNamespace;
}

/**
 * Handler injection for tests. Production passes nothing and the real
 * handlers fire. Tests pass spies so the dispatcher can be exercised
 * without spinning up D1/KV. Each field is optional so tests can override
 * a subset.
 */
export interface CronHandlers {
  reconcileKv?: (env: CronEnv) => Promise<unknown>;
  reapTrials?: (env: CronEnv) => Promise<unknown>;
  rollups?: (env: CronEnv) => Promise<unknown>;
  retention?: (env: CronEnv) => Promise<unknown>;
  capabilityBadges?: (env: CronEnv) => Promise<unknown>;
  kindRollup?: (env: CronEnv) => Promise<unknown>;
}

export async function handleScheduled(
  controller: ScheduledController,
  env: CronEnv,
  handlers: CronHandlers = {},
): Promise<void> {
  const cron = controller.cron;
  const h = {
    reconcileKv: handlers.reconcileKv ?? reconcileKv,
    reapTrials: handlers.reapTrials ?? reapTrials,
    rollups: handlers.rollups ?? rollups,
    retention: handlers.retention ?? retention,
    capabilityBadges: handlers.capabilityBadges ?? capabilityBadges,
    kindRollup: handlers.kindRollup ?? kindRollup,
  };
  console.log(`[cron] firing cron='${cron}' scheduled_time=${controller.scheduledTime}`);

  try {
    switch (cron) {
      case '*/5 * * * *': {
        await h.reconcileKv(env);
        return;
      }
      case '0 * * * *': {
        // Both reap-trials and rollups fire on the hour.
        const settled = await Promise.allSettled([h.reapTrials(env), h.rollups(env)]);
        for (const r of settled) {
          if (r.status === 'rejected') {
            console.error('[cron] hourly handler rejected', r.reason);
          }
        }
        return;
      }
      case '0 4 * * *': {
        // Daily 4am: retention sweep + capability-badges rollup + kind rollup.
        const settled = await Promise.allSettled([
          h.retention(env),
          h.capabilityBadges(env),
          h.kindRollup(env),
        ]);
        for (const r of settled) {
          if (r.status === 'rejected') {
            console.error('[cron] daily 4am handler rejected', r.reason);
          }
        }
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
