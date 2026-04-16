/**
 * /__shippie/feedback
 *
 * POST / — submit feedback. Accepts both identified (Authorization: Bearer JWT
 * from maker's BYO auth) and anonymous submissions.
 * POST /:id/vote — upvote/downvote (requires identity).
 *
 * Identity model (v5 pivot):
 *   - Authorization: Bearer <jwt> → worker forwards to platform, which
 *     validates the JWT against the app's backend JWKS endpoint
 *   - No auth header → anonymous submission (rate-limited by IP, no votes)
 *
 * Spec v5 §2 (BYO backend identity bridge).
 */
import { Hono, type Context } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const feedbackRouter = new Hono<AppBindings>();

/**
 * Extract identity from the Authorization header. Returns null for
 * anonymous users. The actual JWT validation happens on the platform
 * side — the worker forwards it opaquely.
 */
function extractBearerToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Context<AppBindings, any, any>,
): string | null {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

feedbackRouter.post('/:id/vote', async (c) => {
  const token = extractBearerToken(c);
  if (!token) {
    return c.json({ error: 'unauthenticated', message: 'Voting requires a signed-in user. Pass Authorization: Bearer <jwt>.' }, 401);
  }

  const body = await c.req.json().catch(() => ({})) as { value?: number };
  if (body.value !== 1 && body.value !== -1) {
    return c.json({ error: 'value must be 1 or -1' }, 400);
  }

  const res = await platformJson<{ delta: number }>(c.env, 'POST', '/api/internal/sdk/feedback/vote', {
    slug: c.var.slug,
    bearer_token: token,
    feedback_id: c.req.param('id'),
    value: body.value,
  });
  if (!res.ok) return c.json({ error: 'vote_failed', details: res.data }, 502);
  return c.json(res.data as object, 200);
});

feedbackRouter.post('/', async (c) => {
  const token = extractBearerToken(c);
  const ip = clientKey(c.req.raw);

  // Rate limit: identified users get 10/min, anonymous get 3/min
  const rlKey = token
    ? `feedback:${c.var.slug}:jwt:${token.slice(-16)}`
    : `feedback:${c.var.slug}:anon:${ip}`;
  const rl = checkRateLimit({
    key: rlKey,
    limit: token ? 10 : 3,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return c.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      429,
      { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) },
    );
  }

  const body = await c.req.json().catch(() => ({})) as {
    type?: string;
    title?: string;
    body?: string;
    rating?: number;
  };

  if (!body.type) return c.json({ error: 'missing_type' }, 400);

  const res = await platformJson<{ id: string }>(c.env, 'POST', '/api/internal/sdk/feedback', {
    slug: c.var.slug,
    bearer_token: token,
    type: body.type,
    title: body.title,
    body: body.body,
    rating: body.rating,
  });

  if (!res.ok) {
    return c.json({ error: 'submit_failed', details: res.data }, 502);
  }
  return c.json(res.data as object, 200);
});
