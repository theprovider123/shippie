/**
 * /__shippie/analytics
 *
 * POST — ingest a batch of analytics events for the current app.
 *
 * Accepts events from both authenticated and anonymous visitors. The
 * resolved `user_id` is null for anonymous ones. Session cookies aren't
 * required, but if present we use them to attach a user_id.
 *
 * Body:
 *   { events: Array<{ event_name, session_id?, properties?, url?, referrer? }> }
 *
 * Spec v6 §10.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const analyticsRouter = new Hono<AppBindings>();

// SDK event shape (what shippie.track() sends)
interface SdkEvent {
  event?: string;        // SDK field name
  event_name?: string;   // platform field name (forward compat)
  props?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  ts?: number;
  identify?: boolean;
  session_id?: string;
  url?: string;
  referrer?: string;
}

// Platform event shape (what /api/internal/sdk/analytics expects)
interface PlatformEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  session_id?: string;
  url?: string;
  referrer?: string;
}

/** Normalize SDK event fields → platform canonical shape. */
function normalizeEvent(e: SdkEvent): PlatformEvent | null {
  const name = e.event_name ?? e.event;
  if (!name) return null;
  return {
    event_name: name,
    properties: e.properties ?? e.props ?? undefined,
    session_id: e.session_id,
    url: e.url,
    referrer: e.referrer,
  };
}

analyticsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawEvents = Array.isArray((body as { events?: unknown }).events)
    ? ((body as { events: unknown[] }).events as SdkEvent[])
    : [];

  if (rawEvents.length === 0) return c.json({ success: true, ingested: 0 }, 200);
  if (rawEvents.length > 50) return c.json({ error: 'batch_too_large' }, 400);

  // Normalize SDK shape → platform shape
  const events = rawEvents.map(normalizeEvent).filter((e): e is PlatformEvent => e !== null);
  if (events.length === 0) return c.json({ success: true, ingested: 0 }, 200);

  // 120 batches / minute / client / app
  const key = `analytics:${c.var.slug}:${clientKey(c.req.raw)}`;
  const rl = checkRateLimit({ key, limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return c.json(
      { error: 'rate_limited', retry_after_ms: rl.retryAfterMs },
      429,
      { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) },
    );
  }

  const res = await platformJson<{ ingested: number }>(c.env, 'POST', '/api/internal/sdk/analytics', {
    slug: c.var.slug,
    events,
  });

  if (!res.ok) {
    return c.json({ error: 'ingest_failed', details: res.data }, 502);
  }
  return c.json(res.data as object, 200);
});
