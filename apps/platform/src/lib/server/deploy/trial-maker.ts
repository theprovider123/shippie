/**
 * Synthetic "anonymous trial maker" plumbing.
 *
 * Trial deploys (POST /api/deploy/trial) are anonymous, but `apps.maker_id`
 * is NOT NULL with a foreign key into `users(id)`. Rather than make the
 * column nullable (which would ripple through dashboards + ranking
 * queries) or fork the deploy pipeline with a parallel `trial_apps`
 * table, we keep one synthetic user row and reuse it for every trial.
 *
 * The id is a stable v4-shaped UUID with a recognisable suffix so it's
 * obvious in logs and queries. The corresponding row is seeded by
 * migration `0005_trial_maker_seed.sql`. `ensureTrialMakerSeeded` is a
 * runtime self-heal — it INSERT OR IGNORE's the row so the trial route
 * works even on D1 instances where the migration hasn't yet been
 * applied (or in fresh test fixtures).
 */
import type { D1Database } from '@cloudflare/workers-types';

export const TRIAL_MAKER_ID = '00000000-0000-4000-8000-trialmakerid01';
export const TRIAL_MAKER_EMAIL = 'trial+anonymous@shippie.app';
export const TRIAL_MAKER_USERNAME = 'shippie-trial-anonymous';

/**
 * Idempotent ensure for the synthetic trial-maker user row. Safe to call
 * on every request — D1 turns this into a single UNIQUE-violation no-op
 * after the first hit.
 */
export async function ensureTrialMakerSeeded(d1: D1Database): Promise<void> {
  await d1
    .prepare(
      `INSERT OR IGNORE INTO users
         (id, email, username, display_name, is_admin, verified_maker)
       VALUES (?, ?, ?, ?, 0, 0)`,
    )
    .bind(TRIAL_MAKER_ID, TRIAL_MAKER_EMAIL, TRIAL_MAKER_USERNAME, 'Anonymous Trial')
    .run();
}
