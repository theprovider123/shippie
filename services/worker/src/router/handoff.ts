/**
 * __shippie/handoff — desktop→mobile handoff proxy.
 *
 * Accepts `{ mode: 'email' | 'push', email?, handoff_url }` and forwards
 * (signed) to the platform at /api/internal/handoff. Rate-limited per
 * client IP to 5 req/min to stop spam-email abuse.
 *
 * Spec §5.2.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const handoffRouter = new Hono<AppBindings>();

interface HandoffBody {
  mode?: unknown;
  email?: unknown;
  handoff_url?: unknown;
}

function isEmail(x: unknown): x is string {
  return typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

handoffRouter.post('/', async (c) => {
  const rl = checkRateLimit({
    key: `handoff:${c.var.slug}:${clientKey(c.req.raw)}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return c.json({ error: 'rate_limited' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as HandoffBody;
  const mode = body.mode;
  if (mode !== 'email' && mode !== 'push') {
    return c.json({ error: 'invalid_mode' }, 400);
  }
  if (mode === 'email' && !isEmail(body.email)) {
    return c.json({ error: 'invalid_email' }, 400);
  }
  if (typeof body.handoff_url !== 'string') {
    return c.json({ error: 'missing_handoff_url' }, 400);
  }

  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/handoff',
    {
      slug: c.var.slug,
      mode,
      email: mode === 'email' ? body.email : undefined,
      handoff_url: body.handoff_url,
    },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return c.json({ ok: true });
});
