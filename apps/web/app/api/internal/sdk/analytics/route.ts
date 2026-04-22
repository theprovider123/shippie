/**
 * POST /api/internal/sdk/analytics
 *
 * Worker-only. Ingests a batch of analytics events resolved to an app +
 * (optionally) a user via the worker session handle.
 *
 * Request body:
 *   {
 *     user_id, app_id, scope,
 *     events: Array<{ event_name, session_id?, properties?, url?, referrer? }>
 *   }
 *
 * Max 50 events per request.
 *
 * Spec v6 §10.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { parseRawBody } from '@/lib/internal/validation';
import { withLogger } from '@/lib/observability/logger';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AnalyticsEventSchema = z.object({
  event_name: z.string().min(1).max(120),
  session_id: z.string().max(120).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  url: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
});

const AnalyticsBodySchema = z.object({
  user_id: z.string().nullish(),
  app_id: z.string().nullish(),
  slug: z.string().optional(),
  scope: z.array(z.string()).optional(),
  events: z.array(AnalyticsEventSchema).max(50),
});

export const POST = withLogger('sdk.analytics', async (req: NextRequest) => {
  const rawBody = await req.text();
  try {
    await verifyInternalRequest(req, rawBody);
  } catch (err) {
    return NextResponse.json(
      { error: 'unauthorized', message: (err as Error).message },
      { status: 401 },
    );
  }

  const parsed = parseRawBody(rawBody, AnalyticsBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.events.length === 0) {
    return NextResponse.json({ success: true, ingested: 0 });
  }

  // Rate limit: 600 analytics events / minute / app (10/sec).
  // This is the aggregate budget — a single burst can burn the whole
  // minute allowance in one batch.
  const rlKey = body.app_id ? `analytics:${body.app_id}` : `analytics:slug:${body.slug}`;
  const rl = checkRateLimit({ key: rlKey, limit: 600, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const db = await getDb();

  // Resolve app_id from slug if not supplied (anonymous path)
  let appId = body.app_id ?? null;
  if (!appId && body.slug) {
    const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, body.slug) });
    appId = app?.id ?? null;
  }
  if (!appId) {
    return NextResponse.json({ error: 'unknown_app' }, { status: 404 });
  }

  const rows = body.events.map((e) => ({
    appId,
    userId: body.user_id ?? null,
    sessionId: e.session_id ?? null,
    eventName: e.event_name,
    properties: e.properties ?? null,
    url: e.url ?? null,
    referrer: e.referrer ?? null,
  }));
  await db.insert(schema.analyticsEvents).values(rows);

  return NextResponse.json({ success: true, ingested: rows.length });
});
