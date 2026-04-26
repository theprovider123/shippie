/**
 * /__shippie/beacon — sendBeacon-friendly event ingestion.
 *
 * Same persistence target as /__shippie/analytics (the analytics_events
 * D1 table) but optimised for fire-and-forget paths: status 204 always,
 * never blocks the unload, swallows partial-batch failures.
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { eq } from 'drizzle-orm';

interface BeaconEvent {
  event?: string;
  event_type?: string;
  event_name?: string;
  session_id?: string;
  user_id?: string;
  properties?: Record<string, unknown>;
}

export async function handleBeacon(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const rl = checkRateLimit({
    key: `beacon:${ctx.slug}:${clientKey(ctx.request)}`,
    limit: 100,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await ctx.request.json().catch(() => null)) as { events?: BeaconEvent[] } | null;
  if (!body || !Array.isArray(body.events)) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const events = body.events.slice(0, 200);
  if (events.length === 0) return new Response(null, { status: 204 });

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return new Response(null, { status: 204 }); // ack-and-drop unknown apps

  const rows = events
    .map((e) => {
      const name = e.event_name ?? e.event_type ?? e.event;
      if (!name || typeof name !== 'string') return null;
      return {
        appId: app.id,
        userId: e.user_id ?? null,
        sessionId: e.session_id ?? null,
        eventName: name,
        properties: e.properties ?? null,
        url: null,
        referrer: null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return new Response(null, { status: 204 });

  try {
    await db.insert(schema.analyticsEvents).values(rows);
  } catch (err) {
    console.error('[wrapper:beacon] insert failed', { slug: ctx.slug, err });
    // 204 still — beacon path is fire-and-forget.
  }

  return new Response(null, { status: 204 });
}
