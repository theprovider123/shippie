/**
 * __shippie/beacon — batched event ingestion.
 *
 * Accepts `{ events: [...] }` from the SDK (including sendBeacon on
 * visibilitychange) and forwards (signed) to the platform at
 * /api/internal/ingest-events. Rate-limited per client IP to 120 req/min.
 * Events array is capped at 200 per request to bound platform cost.
 *
 * Spec §5.2.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const beaconRouter = new Hono<AppBindings>();

beaconRouter.post('/', async (c) => {
  const rl = checkRateLimit({
    key: `beacon:${c.var.slug}:${clientKey(c.req.raw)}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.ok) return c.json({ error: 'rate_limited' }, 429);

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray((body as { events?: unknown }).events)) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const events = (body as { events: unknown[] }).events.slice(0, 200);

  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/ingest-events',
    { slug: c.var.slug, events },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});
