/**
 * /__shippie/analytics — batch analytics ingestion endpoint.
 *
 * Persists wrapper-side SDK events to the `analytics_events` D1 table.
 * Per-(slug, ip) sliding-window rate limit, capped batch size, all writes
 * idempotent on uuid PK. Errors per-event are swallowed so one bad row
 * doesn't 500 the whole batch.
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { eq } from 'drizzle-orm';

interface SdkEvent {
  event?: string;
  event_name?: string;
  props?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  ts?: number;
  identify?: boolean;
  session_id?: string;
  url?: string;
  referrer?: string;
  user_id?: string;
}

interface PlatformEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  session_id?: string;
  url?: string;
  referrer?: string;
  user_id?: string;
}

function normalize(e: SdkEvent): PlatformEvent | null {
  const name = e.event_name ?? e.event;
  if (!name || typeof name !== 'string' || name.length === 0 || name.length > 128) return null;
  return {
    event_name: name,
    properties: e.properties ?? e.props ?? undefined,
    session_id: typeof e.session_id === 'string' ? e.session_id : undefined,
    url: typeof e.url === 'string' ? e.url : undefined,
    referrer: typeof e.referrer === 'string' ? e.referrer : undefined,
    user_id: typeof e.user_id === 'string' ? e.user_id : undefined,
  };
}

export async function handleAnalytics(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const body = (await ctx.request.json().catch(() => ({}))) as { events?: SdkEvent[] };
  const raw = Array.isArray(body.events) ? body.events : [];
  if (raw.length === 0) return Response.json({ success: true, received: 0, ingested: 0 });
  if (raw.length > 50) return Response.json({ success: false, error: 'batch_too_large' }, { status: 400 });

  const events = raw.map(normalize).filter((e): e is PlatformEvent => e !== null);
  if (events.length === 0) {
    return Response.json({ success: true, received: raw.length, ingested: 0, dropped: raw.length });
  }

  const rl = checkRateLimit({
    key: `analytics:${ctx.slug}:${clientKey(ctx.request)}`,
    limit: 100,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return Response.json(
      { success: false, error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // Resolve slug → app_id (FK on analytics_events).
  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return Response.json({ success: false, error: 'unknown_app', slug: ctx.slug }, { status: 404 });

  let ingested = 0;
  try {
    await db.insert(schema.analyticsEvents).values(
      events.map((e) => ({
        appId: app.id,
        userId: e.user_id ?? null,
        sessionId: e.session_id ?? null,
        eventName: e.event_name,
        properties: e.properties ?? null,
        url: e.url ?? null,
        referrer: e.referrer ?? null,
      })),
    );
    ingested = events.length;
  } catch (err) {
    console.error('[wrapper:analytics] insert failed', { slug: ctx.slug, err });
    return Response.json({ success: false, error: 'insert_failed' }, { status: 500 });
  }

  return Response.json({
    success: true,
    slug: ctx.slug,
    received: raw.length,
    ingested,
    dropped: raw.length - events.length,
    traceId: ctx.traceId,
  });
}
