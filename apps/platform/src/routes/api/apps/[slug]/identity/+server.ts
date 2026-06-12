/**
 * PATCH /api/apps/[slug]/identity
 *
 * Maker-only: rename the app, change its slug, set themeColor, iconEmoji,
 * or iconUrl. When the slug changes, runtime storage is migrated before the
 * DB swap and the retired slug is recorded as an alias for old links.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';
import { migrateRuntimeSlug } from '$server/deploy/runtime-slug-migration';
import { recordSlugRename } from '$server/slug-aliases';
import {
  APP_SLUG_RE,
  checkAppSlugAvailability,
  normalizeAppSlug,
} from '$server/apps/slug-availability';

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
      activeDeployId: schema.apps.activeDeployId,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, currentSlug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  const newName = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : app.name;
  const newSlug = typeof body.slug === 'string' ? normalizeAppSlug(body.slug) : currentSlug;

  if (!newName) return json({ error: 'name_required' }, { status: 400 });
  if (!APP_SLUG_RE.test(newSlug)) return json({ error: 'invalid_slug' }, { status: 400 });

  // Remixes keep the identity they were forked with. Name/slug/icon stay
  // locked to preserve lineage attribution (and block look-alike apps);
  // theme colour remains the remixer's to change. UI disables these
  // fields too — this is the enforcement layer.
  const wantsIdentityChange =
    newName !== app.name ||
    newSlug !== currentSlug ||
    typeof body.iconEmoji === 'string' ||
    typeof body.iconUrl === 'string';
  if (wantsIdentityChange) {
    const [lineage] = await db
      .select({ parentAppId: schema.appLineage.parentAppId })
      .from(schema.appLineage)
      .where(eq(schema.appLineage.appId, app.id))
      .limit(1);
    if (lineage?.parentAppId) {
      return json({ error: 'remix_identity_locked' }, { status: 403 });
    }
  }

  if (newSlug !== currentSlug) {
    const availability = await checkAppSlugAvailability(db, newSlug, {
      excludeAppId: app.id,
      excludeSlug: app.slug,
    });
    if (!availability.available) {
      return json(
        { error: 'slug_taken', reason: availability.reason, targetSlug: availability.targetSlug ?? null },
        { status: 409 },
      );
    }
    if (app.activeDeployId) {
      if (!env.CACHE || !env.APPS) {
        return json({ error: 'runtime_storage_unavailable' }, { status: 503 });
      }
      const migration = await migrateRuntimeSlug({
        kv: env.CACHE,
        r2: env.APPS,
        db,
        appId: app.id,
        from: app.slug,
        to: newSlug,
        name: newName,
      });
      if (migration.stage !== 'complete') {
        return json({ error: 'runtime_migration_incomplete' }, { status: 503 });
      }
    }
  }

  const updates: Record<string, unknown> = { name: newName, slug: newSlug };
  if (typeof body.themeColor === 'string') updates.themeColor = body.themeColor;
  if (typeof body.iconEmoji === 'string') updates.iconEmoji = body.iconEmoji;
  if (typeof body.iconUrl === 'string') updates.iconUrl = body.iconUrl;

  try {
    await db.update(schema.apps).set(updates).where(eq(schema.apps.id, app.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|constraint/i.test(message)) {
      return json({ error: 'slug_taken', reason: 'active_app' }, { status: 409 });
    }
    throw err;
  }

  if (newSlug !== currentSlug) {
    await recordSlugRename(db, { appId: app.id, fromSlug: app.slug, toSlug: newSlug });

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
    // Include name — the wrapper's manifest synth reads meta.name, and
    // without this a rename only reached subdomains on the next deploy.
    const kvPatch: Record<string, unknown> = { slug: newSlug, name: newName };
    if (typeof body.themeColor === 'string') kvPatch.theme_color = body.themeColor;
    await patchAppMeta(env.CACHE, newSlug, kvPatch).catch(() => {});
  }

  return json({ success: true, slug: newSlug, name: newName });
};
