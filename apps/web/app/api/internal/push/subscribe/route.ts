// apps/web/app/api/internal/push/subscribe/route.ts
/**
 * Platform-side push subscription upsert.
 *
 * The worker's /__shippie/push/subscribe route signs and forwards the
 * browser's PushSubscription here. We key on `endpoint` (globally
 * unique per Web Push spec) and update `keys` + `appId` on conflict —
 * keys rotate when the browser refreshes the subscription, and the
 * same endpoint may re-appear under a different app during testing.
 */
import { type NextRequest } from 'next/server';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RawBody {
  slug?: unknown;
  subscription?: unknown;
  user_id?: unknown;
}

interface RawSubscription {
  endpoint?: unknown;
  keys?: unknown;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = withLogger('shippie.internal.push.subscribe', async (req: NextRequest) => {
  const raw = await req.text();
  try {
    await verifyInternalRequest(req, raw);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'unauthorized', message: (err as Error).message }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: RawBody;
  try {
    body = JSON.parse(raw) as RawBody;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const slug = typeof body.slug === 'string' && body.slug.length > 0 ? body.slug : null;
  if (!slug) return jsonError(400, 'missing_slug');
  if (!body.subscription || typeof body.subscription !== 'object') {
    return jsonError(400, 'missing_subscription');
  }
  const sub = body.subscription as RawSubscription;
  const endpoint = typeof sub.endpoint === 'string' && sub.endpoint.length > 0 ? sub.endpoint : null;
  if (!endpoint) return jsonError(400, 'missing_endpoint');
  if (!sub.keys || typeof sub.keys !== 'object' || Array.isArray(sub.keys)) {
    return jsonError(400, 'missing_keys');
  }
  const keys = sub.keys as Record<string, unknown>;

  const userId = typeof body.user_id === 'string' && body.user_id.length > 0 ? body.user_id : null;

  const db = await getDb();
  await db
    .insert(schema.wrapperPushSubscriptions)
    .values({
      endpoint,
      appId: slug,
      userId,
      keys,
    })
    .onConflictDoUpdate({
      target: schema.wrapperPushSubscriptions.endpoint,
      set: {
        appId: slug,
        userId,
        keys,
      },
    });

  return new Response(null, { status: 204 });
});
