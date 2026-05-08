import type { D1Database } from '@cloudflare/workers-types';

export interface OpsMaintenanceResult {
  expiredVerificationTokens: number;
  expiredSessions: number;
  staleRateLimits: number;
  staleCronRuns: number;
  markedCronRunsFailed: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function opsMaintenance(
  env: { DB: D1Database },
  opts?: { now?: Date; cronRunDaysToKeep?: number },
): Promise<OpsMaintenanceResult> {
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const staleLimiterCutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const cronRunCutoff = new Date(now.getTime() - (opts?.cronRunDaysToKeep ?? 30) * DAY_MS).toISOString();
  const runningTimeout = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const expiredVerificationTokens = await changes(env.DB, 'DELETE FROM verification_tokens WHERE expires < ?', nowIso);
  const expiredSessions = await changes(env.DB, 'DELETE FROM sessions WHERE expires_at < ?', nowIso);
  const staleRateLimits = await changes(env.DB, 'DELETE FROM auth_rate_limits WHERE reset_at < ?', staleLimiterCutoff);
  const markedCronRunsFailed = await changes(
    env.DB,
    `UPDATE cron_runs
     SET status = 'failed',
         finished_at = ?,
         error_message = 'Marked failed by opsMaintenance after 6h without finish.'
     WHERE status = 'running' AND started_at < ?`,
    nowIso,
    runningTimeout,
  );
  const staleCronRuns = await changes(env.DB, 'DELETE FROM cron_runs WHERE started_at < ?', cronRunCutoff);

  return { expiredVerificationTokens, expiredSessions, staleRateLimits, staleCronRuns, markedCronRunsFailed };
}

async function changes(db: D1Database, sql: string, ...values: string[]): Promise<number> {
  const result = await db.prepare(sql).bind(...values).run();
  return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
}
