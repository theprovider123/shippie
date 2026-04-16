/**
 * POST /api/internal/reap-trials
 *
 * Cron endpoint. Archives trial apps whose TTL has elapsed.
 * Guarded by SHIPPIE_INTERNAL_CRON_TOKEN so it isn't callable from
 * the public internet.
 *
 * Run hourly via your cron provider:
 *   curl -X POST https://shippie.app/api/internal/reap-trials \
 *     -H "Authorization: Bearer $SHIPPIE_INTERNAL_CRON_TOKEN"
 *
 * Differentiation plan Pillar B2.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { reapExpiredTrials } from '@/lib/deploy/trial';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const token = process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  if (!token) return false; // fail-closed if not configured
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return provided === token;
}

export const POST = withLogger('internal.reap-trials', async (req: NextRequest) => {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await reapExpiredTrials();
  return NextResponse.json({
    ok: true,
    archived: result.archived,
    slugs: result.slugs,
    at: new Date().toISOString(),
  });
});
