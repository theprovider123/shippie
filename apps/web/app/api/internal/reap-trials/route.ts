/**
 * /api/internal/reap-trials — cron endpoint.
 *
 * Archives trial apps whose TTL has elapsed. Runs hourly.
 *
 * Auth: see lib/internal/cron-auth.ts — accepts SHIPPIE_INTERNAL_CRON_TOKEN
 * (self-host) or CRON_SECRET (Vercel cron).
 *
 * Both GET and POST are exposed: Vercel's managed cron sends GET; manual
 * invocations can use POST.
 *
 * Differentiation plan Pillar B2.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { reapExpiredTrials } from '@/lib/deploy/trial';
import { authorizeCron } from '@/lib/internal/cron-auth';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req: NextRequest): Promise<Response> {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await reapExpiredTrials();
  return NextResponse.json({
    ok: true,
    archived: result.archived,
    slugs: result.slugs,
    at: new Date().toISOString(),
  });
}

export const GET = withLogger('internal.reap-trials', run);
export const POST = withLogger('internal.reap-trials', run);
