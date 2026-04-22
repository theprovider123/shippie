// apps/web/app/api/shippie/install-click/route.ts
/**
 * Accepts install-click beacons from marketplace listings. Writes an
 * `install_click` event into app_events so the rollup cron can attribute
 * installs to the marketplace surface (home / category / search / leaderboard).
 *
 * Body: `{ slug: string, source?: string }`. `source` is the referral
 * label captured from `?ref=…` and is clamped to 64 chars. Bad JSON /
 * missing slug silently returns 204 — beacons must never be noisy.
 */
import { type NextRequest } from 'next/server';
import { withLogger } from '@/lib/observability/logger';
import { getDb } from '@/lib/db';
import { schema } from '@shippie/db';

export const runtime = 'nodejs';

interface Body {
  slug?: unknown;
  source?: unknown;
}

export const POST = withLogger('shippie.install-click', async (req: NextRequest) => {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(null, { status: 204 });
  }
  if (typeof body.slug !== 'string' || body.slug.length === 0) {
    return new Response(null, { status: 204 });
  }
  const source =
    typeof body.source === 'string' && body.source.length > 0
      ? body.source.slice(0, 64)
      : null;
  const db = await getDb();
  await db.insert(schema.appEvents).values({
    appId: body.slug,
    sessionId: req.headers.get('x-session-id') ?? 'unknown',
    eventType: 'install_click',
    metadata: source ? { source } : {},
    ts: new Date(),
  });
  return new Response(null, { status: 204 });
});
