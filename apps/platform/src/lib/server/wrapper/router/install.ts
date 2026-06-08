/**
 * /__shippie/install — install attribution beacon.
 *
 * Persists install events as analytics_events rows with `event_name`
 * shaped as `install_{event}` (e.g. `install_a2hs_accepted`,
 * `install_a2hs_dismissed`, `install_pwa_displayed`).
 *
 * Read paths:
 *   GET /__shippie/install        → ack with slug + installed=false
 *   GET /__shippie/install/phone  → return canonical install URL for the slug
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { eq } from 'drizzle-orm';
import { sanitizeAnalyticsEvent } from '../../analytics/sanitize';

interface InstallAnalyticsBody {
  event?: string;
  outcome?: string;
  session_id?: string;
  user_id?: string;
  properties?: Record<string, unknown>;
}

export function sanitizeInstallAnalyticsEvent(body: InstallAnalyticsBody) {
  const eventName = body.event && /^[a-z0-9_]{1,64}$/.test(body.event)
    ? `install_${body.event}`
    : 'install_unknown';
  return {
    eventName,
    event: sanitizeAnalyticsEvent({
      event_name: eventName,
      session_id: body.session_id,
      properties: {
        outcome: body.outcome ?? null,
        ...(body.properties ?? {}),
      },
    }),
  };
}

export async function handleInstall(ctx: WrapperContext): Promise<Response> {
  const method = ctx.request.method;

  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    if (url.pathname.endsWith('/phone')) {
      const isLocal = url.hostname.includes('localhost');
      const installUrl = isLocal
        ? `http://${ctx.slug}.localhost:4200/`
        : `https://${ctx.slug}.shippie.app/`;
      return Response.json({ slug: ctx.slug, install_url: installUrl });
    }
    return Response.json({ slug: ctx.slug, installed: false });
  }

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rl = checkRateLimit({
    key: `install:${ctx.slug}:${clientKey(ctx.request)}`,
    limit: 100,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await ctx.request.json().catch(() => ({}))) as InstallAnalyticsBody;
  const { eventName, event } = sanitizeInstallAnalyticsEvent(body);
  if (!event) return Response.json({ ok: true, event: eventName });

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return Response.json({ ok: true, event: eventName }); // ack unknown app

  try {
    await db.insert(schema.analyticsEvents).values({
      appId: app.id,
      userId: event.userId,
      sessionId: event.sessionId,
      eventName: event.eventName,
      properties: event.properties,
      url: event.url,
      referrer: event.referrer,
    });
  } catch (err) {
    console.error('[wrapper:install] insert failed', { slug: ctx.slug, err });
  }

  return Response.json({ ok: true, event: eventName });
}
