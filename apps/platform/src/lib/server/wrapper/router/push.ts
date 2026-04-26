/**
 * /__shippie/push — Web Push subscription plumbing.
 *
 * /vapid-key       → return the public VAPID key from KV
 * /subscribe       → upsert into wrapper_push_subscriptions (PK=endpoint)
 * /unsubscribe     → delete by endpoint
 *
 * Per-(slug, ip) rate limit: 30/min on writes.
 */
import type { WrapperContext } from '../env';
import { checkRateLimit, clientKey } from '../rate-limit';
import { getDrizzleClient, schema } from '../../db/client';
import { and, eq } from 'drizzle-orm';

export async function handlePushVapidKey(ctx: WrapperContext): Promise<Response> {
  const key = await ctx.env.CACHE.get('push:vapid_public');
  if (!key) {
    return Response.json({ error: 'push_not_configured' }, { status: 503 });
  }
  return Response.json({ key });
}

export async function handlePushSubscribe(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const rl = checkRateLimit({
    key: `push-sub:${ctx.slug}:${clientKey(ctx.request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const body = (await ctx.request.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    user_id?: string;
  };

  if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
    return Response.json({ error: 'missing_endpoint' }, { status: 400 });
  }
  if (
    !body.keys ||
    typeof body.keys.p256dh !== 'string' ||
    typeof body.keys.auth !== 'string'
  ) {
    return Response.json({ error: 'missing_keys' }, { status: 400 });
  }

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return Response.json({ error: 'unknown_app' }, { status: 404 });

  try {
    await db
      .insert(schema.wrapperPushSubscriptions)
      .values({
        endpoint: body.endpoint,
        appId: app.id,
        userId: body.user_id ?? null,
        keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      })
      .onConflictDoUpdate({
        target: [schema.wrapperPushSubscriptions.endpoint],
        set: {
          appId: app.id,
          userId: body.user_id ?? null,
          keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
        },
      });
  } catch (err) {
    console.error('[wrapper:push-subscribe] upsert failed', { slug: ctx.slug, err });
    return Response.json({ error: 'insert_failed' }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

export async function handlePushUnsubscribe(ctx: WrapperContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const body = (await ctx.request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return Response.json({ error: 'missing_endpoint' }, { status: 400 });
  }

  const db = getDrizzleClient(ctx.env.DB);
  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, ctx.slug),
    columns: { id: true },
  });
  if (!app) return new Response(null, { status: 204 });

  try {
    await db
      .delete(schema.wrapperPushSubscriptions)
      .where(
        and(
          eq(schema.wrapperPushSubscriptions.endpoint, body.endpoint),
          eq(schema.wrapperPushSubscriptions.appId, app.id),
        ),
      );
  } catch (err) {
    console.error('[wrapper:push-unsubscribe] delete failed', { slug: ctx.slug, err });
  }

  return new Response(null, { status: 204 });
}
