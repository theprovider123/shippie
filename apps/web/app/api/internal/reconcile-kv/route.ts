/**
 * /api/internal/reconcile-kv — cron reconciliation.
 *
 * Reads every app's `activeDeployId` from the DB and re-writes any
 * `apps:{slug}:active` KV entry that disagrees. Backstops the deploy
 * hot path's non-atomic KV write sequence.
 *
 * Auth: see lib/internal/cron-auth.ts — accepts SHIPPIE_INTERNAL_CRON_TOKEN
 * (self-host) or CRON_SECRET (Vercel cron).
 *
 * Both GET and POST are exposed: Vercel's managed cron sends GET;
 * manual invocations can use POST. Idempotent and cheap when nothing
 * has drifted, so running every few minutes is fine.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { reconcileActivePointers } from '@/lib/deploy/reconcile-kv';
import { authorizeCron } from '@/lib/internal/cron-auth';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req: NextRequest): Promise<Response> {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await reconcileActivePointers();
  return NextResponse.json({
    ok: true,
    checked: result.checked,
    updated: result.updated,
    csp_updated: result.csp_updated,
    missing_version: result.missing_version,
    errors: result.errors,
    at: new Date().toISOString(),
  });
}

export const GET = withLogger('internal.reconcile-kv', run);
export const POST = withLogger('internal.reconcile-kv', run);
