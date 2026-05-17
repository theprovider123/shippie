/**
 * Synthetic "Shippie Shell" plumbing for client-side platform analytics.
 *
 * The platform shell sends events to /__shippie/analytics (install nudge,
 * standalone launch, SW update accept/skip, viewport mode, keyboard
 * signals). That endpoint requires an apps row to FK against — the same
 * constraint trial-deploys hit. Rather than make the columns nullable
 * (which would ripple through every dashboard/ranking query), we keep
 * one synthetic user + app row and reuse them for every shell event.
 *
 * Mirrors `apps/platform/src/lib/server/deploy/trial-maker.ts` exactly.
 *
 * The migration `0034_shippie_shell_seed.sql` performs the seed at
 * deploy time. `ensureShellAppSeeded` is the runtime self-heal — it
 * INSERT OR IGNORE's both rows so the analytics route works even on
 * D1 instances where the migration hasn't been applied yet (test
 * fixtures, fresh dev databases).
 */
import type { D1Database } from '@cloudflare/workers-types';

export const SHELL_USER_ID = '00000000-0000-4000-8000-shippieshell01';
export const SHELL_USER_EMAIL = 'shell+system@shippie.app';
export const SHELL_USER_USERNAME = 'shippie-shell-system';
export const SHELL_APP_ID = 'app_shippie_shell';
export const SHELL_APP_SLUG = '__shippie_shell__';

let cachedSeeded: D1Database | null = null;

/**
 * Idempotent ensure for the synthetic shell user + app rows. Safe to
 * call on every shell-analytics request — D1 turns these into single
 * UNIQUE-violation no-ops after the first hit. We additionally cache
 * the D1 binding reference so we only issue the prepared statements
 * once per request lifecycle.
 */
export async function ensureShellAppSeeded(d1: D1Database): Promise<void> {
  if (cachedSeeded === d1) return;

  await d1
    .prepare(
      `INSERT OR IGNORE INTO users
         (id, email, username, display_name, is_admin, verified_maker)
       VALUES (?, ?, ?, ?, 0, 0)`,
    )
    .bind(SHELL_USER_ID, SHELL_USER_EMAIL, SHELL_USER_USERNAME, 'Shippie Shell')
    .run();

  await d1
    .prepare(
      `INSERT OR IGNORE INTO apps
         (id, slug, name, type, category, theme_color, background_color,
          github_branch, source_type, source_kind, upstream_config,
          conflict_policy, maker_id, visibility_scope, is_archived,
          upvote_count, comment_count, install_count,
          active_users_30d, feedback_open_count, github_verified)
       VALUES (?, ?, 'Shippie Shell', 'app', 'system',
               '#14120f', '#14120f', 'main', 'system', 'static', '{}',
               'shippie', ?, 'unlisted', 0, 0, 0, 0, 0, 0, 0)`,
    )
    .bind(SHELL_APP_ID, SHELL_APP_SLUG, SHELL_USER_ID)
    .run();

  cachedSeeded = d1;
}
