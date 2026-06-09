/**
 * PATCH /api/apps/[slug]/identity
 *
 * Maker-only: rename the app, change its slug, set themeColor, iconEmoji,
 * or iconUrl. When the slug changes a 30-day redirect row is inserted into
 * app_slug_redirects and a KV pointer is written for the runtime serve path.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const PATCH: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const currentSlug = event.params.slug;

  let body: Record<string, unknown>;
  try {
    body = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({
      id: schema.apps.id,
      makerId: schema.apps.makerId,
      slug: schema.apps.slug,
      name: schema.apps.name,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, currentSlug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  const newName = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : app.name;
  const newSlug = typeof body.slug === 'string' ? body.slug.trim() : currentSlug;

  if (!newName) return json({ error: 'name_required' }, { status: 400 });
  if (!SLUG_RE.test(newSlug)) return json({ error: 'invalid_slug' }, { status: 400 });

  if (newSlug !== currentSlug) {
    const [conflict] = await db
      .select({ id: schema.apps.id })
      .from(schema.apps)
      .where(eq(schema.apps.slug, newSlug))
      .limit(1);
    if (conflict) return json({ error: 'slug_taken' }, { status: 409 });
  }

  const updates: Record<string, unknown> = { name: newName, slug: newSlug };
  if (typeof body.themeColor === 'string') updates.themeColor = body.themeColor;
  if (typeof body.iconEmoji === 'string') updates.iconEmoji = body.iconEmoji;
  if (typeof body.iconUrl === 'string') updates.iconUrl = body.iconUrl;

  await db.update(schema.apps).set(updates).where(eq(schema.apps.id, app.id));

  if (newSlug !== currentSlug) {
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .insert(schema.appSlugRedirects)
      .values({ oldSlug: currentSlug, newSlug, expiresAt: exp })
      .catch(() => {});

    if (env.CACHE) {
      await env.CACHE.put('apps:' + currentSlug + ':redirect', newSlug, {
        expirationTtl: 2592000,
      }).catch(() => {});
    }
  }

  if (env.CACHE) {
    const kvPatch: Record<string, unknown> = { slug: newSlug };
    if (typeof body.themeColor === 'string') kvPatch.theme_color = body.themeColor;
    await patchAppMeta(env.CACHE, newSlug, kvPatch).catch(() => {});
  }

  return json({ success: true, slug: newSlug, name: newName });
};
