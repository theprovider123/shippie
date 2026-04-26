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

  const body = (await ctx.request.json().catch(() => ({}))) as {
    event?: string;
    outcome?: string;
    session_id?: string;
    user_id?: string;
    properties?: Record<string, unknown>;
  };

  const eventName = body.event && /^[a-z0-9_]{1,64}$/.test(body.event)
    ? `install_${body.event}`
    : 'install_unknown';

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return Response.json({ ok: true, event: eventName }); // ack unknown app

  try {
    await db.insert(schema.analyticsEvents).values({
      appId: app.id,
      userId: body.user_id ?? null,
      sessionId: body.session_id ?? null,
      eventName,
      properties: {
        outcome: body.outcome ?? null,
        ...(body.properties ?? {}),
      },
      url: null,
      referrer: null,
    });
  } catch (err) {
    console.error('[wrapper:install] insert failed', { slug: ctx.slug, err });
  }

  return Response.json({ ok: true, event: eventName });
}
