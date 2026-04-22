// apps/web/app/api/internal/push/unsubscribe/route.ts
/**
 * Platform-side push subscription delete.
 *
 * Keyed on `endpoint`. Idempotent — deleting a missing row still
 * returns 204. The worker's /__shippie/push/unsubscribe route signs
 * and forwards the browser's endpoint here when the user unsubscribes.
 */
import { type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/signed-request';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RawBody {
  slug?: unknown;
  endpoint?: unknown;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST = withLogger('shippie.internal.push.unsubscribe', async (req: NextRequest) => {
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
  const endpoint =
    typeof body.endpoint === 'string' && body.endpoint.length > 0 ? body.endpoint : null;
  if (!endpoint) return jsonError(400, 'missing_endpoint');

  const db = await getDb();
  await db
    .delete(schema.wrapperPushSubscriptions)
    .where(eq(schema.wrapperPushSubscriptions.endpoint, endpoint));

  return new Response(null, { status: 204 });
});
