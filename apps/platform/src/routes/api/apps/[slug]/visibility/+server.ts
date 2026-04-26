/**
 * PATCH /api/apps/[slug]/visibility
 *
 * Maker-only flip between public / unlisted / private. Updates the apps
 * row + propagates to the runtime KV `apps:{slug}:meta` row so the
 * Worker access-gate picks it up.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';

export const PATCH: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const visibility = body.visibility_scope;
  if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);
  const slug = event.params.slug!;

  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  await db
    .update(schema.apps)
    .set({ visibilityScope: visibility, updatedAt: new Date().toISOString() })
    .where(eq(schema.apps.id, app.id));

  await patchAppMeta(env.CACHE, slug, { visibility_scope: visibility });

  return json({ success: true });
};
