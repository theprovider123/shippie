/**
 * __shippie/push — Web Push subscription plumbing.
 *
 * GET  /vapid-key   → returns the VAPID public key (from APP_CONFIG KV).
 * POST /subscribe   → forwards PushSubscription JSON to the platform.
 * POST /unsubscribe → forwards endpoint removal to the platform.
 *
 * The platform stores subscriptions and sends notifications; the worker
 * is just a signed relay.
 *
 * Spec §5.2.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';

export const pushRouter = new Hono<AppBindings>();

pushRouter.get('/vapid-key', async (c) => {
  const key = await c.env.APP_CONFIG.get('push:vapid_public');
  if (!key) return c.json({ error: 'push_not_configured' }, 503);
  return c.json({ key });
});

pushRouter.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/push/subscribe',
    { slug: c.var.slug, subscription: body },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});

pushRouter.post('/unsubscribe', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return c.json({ error: 'missing_endpoint' }, 400);
  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/push/unsubscribe',
    { slug: c.var.slug, endpoint: body.endpoint },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});
