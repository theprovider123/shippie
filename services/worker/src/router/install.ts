/**
 * __shippie/install
 *
 * Install event tracking. Records install-related events (standalone
 * launch, prompt shown, prompt accepted/dismissed) to the analytics
 * pipeline via the platform's internal analytics route. No new table
 * needed — installs are analytics_events with event_name='install_*'.
 *
 * Spec v6 §5, §12.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const installRouter = new Hono<AppBindings>();

installRouter.get('/', (c) => {
  return c.json({
    slug: c.var.slug,
    installed: false,
  });
});

installRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    event?: string;
    outcome?: string;
  };

  const eventName = body.event
    ? `install_${body.event}`
    : 'install_unknown';

  // Rate limit: 10 install events / minute / client
  const rl = checkRateLimit({
    key: `install:${c.var.slug}:${clientKey(c.req.raw)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/sdk/analytics',
    {
      slug: c.var.slug,
      events: [
        {
          event_name: eventName,
          properties: body.outcome ? { outcome: body.outcome } : undefined,
          url: c.req.header('referer') ?? undefined,
        },
      ],
    },
    { traceId: c.var.traceId },
  );

  if (!res.ok) {
    return c.json({ error: 'tracking_failed' }, 502);
  }

  return c.json({ ok: true, event: eventName });
});

installRouter.get('/phone', (c) => {
  const prodUrl = `https://${c.var.slug}.shippie.app/`;
  const isLocal = c.req.url.includes('localhost');
  const devUrl = `http://${c.var.slug}.localhost:4200/`;

  return c.json({
    slug: c.var.slug,
    install_url: isLocal ? devUrl : prodUrl,
  });
});
