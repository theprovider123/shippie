/**
 * POST /api/deploy/rollback
 *
 * Roll an app back to a prior successful deploy version. Maker-only.
 *
 * Body:
 *   { slug, to_version: number }     // target a specific version
 *   { slug, to: "previous" }         // last successful deploy before active
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, lt, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { writeActivePointer, writeCspHeader, patchAppMeta } from '$server/deploy/kv-write';

export const POST: RequestHandler = async (event) => {
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

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!slug) return json({ error: 'missing_slug' }, { status: 400 });

  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({
      id: schema.apps.id,
      makerId: schema.apps.makerId,
      activeDeployId: schema.apps.activeDeployId,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return json({ error: 'app_not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  let target;
  if (typeof body.to_version === 'number') {
    [target] = await db
      .select()
      .from(schema.deploys)
      .where(
        and(
          eq(schema.deploys.appId, app.id),
          eq(schema.deploys.version, body.to_version),
          eq(schema.deploys.status, 'success'),
        ),
      )
      .limit(1);
  } else if (body.to === 'previous') {
    // Find the most recent success that isn't the current active.
    const candidates = await db
      .select()
      .from(schema.deploys)
      .where(
        and(
          eq(schema.deploys.appId, app.id),
          eq(schema.deploys.status, 'success'),
        ),
      )
      .orderBy(desc(schema.deploys.version))
      .limit(2);
    target = candidates.find((d) => d.id !== app.activeDeployId);
  } else {
    return json({ error: 'invalid_target' }, { status: 400 });
  }

  if (!target) return json({ error: 'version_not_found' }, { status: 404 });

  // Flip pointers + KV.
  const now = new Date().toISOString();
  await db
    .update(schema.apps)
    .set({
      activeDeployId: target.id,
      lastDeployedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.apps.id, app.id));

  if (target.cspHeader) {
    await writeCspHeader(env.CACHE, slug, target.cspHeader);
  }
  await patchAppMeta(env.CACHE, slug, { version: target.version });
  await writeActivePointer(env.CACHE, slug, target.version);

  return json({
    success: true,
    slug,
    version: target.version,
    deploy_id: target.id,
    csp_stale: !target.cspHeader,
  });
};
