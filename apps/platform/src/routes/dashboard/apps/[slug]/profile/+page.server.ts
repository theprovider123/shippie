import { fail, redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { normalizeCategory, VALID_CATEGORIES } from '$lib/curation/schema';
import { ingestIcon, isIngestableIconUrl } from '$server/icons/ingest';
import type { App as AppRow } from '$server/db/schema/apps';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const data = await parent();
  if (!platform?.env.DB) return { app: data.app, lineage: null };
  const db = getDrizzleClient(platform.env.DB);
  const [lineage] = await db
    .select()
    .from(schema.appLineage)
    .where(eq(schema.appLineage.appId, data.app.id))
    .limit(1);
  return { app: data.app, lineage: lineage ?? null };
};

export const actions: Actions = {
  save: async ({ request, locals, params, platform, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const app = await loadOwnedApp({
      locals,
      platform,
      slug: params.slug,
      pathname: url.pathname,
    });
    const form = await request.formData();
    const name = clean(form.get('name'), 80);
    const tagline = clean(form.get('tagline'), 160);
    const description = clean(form.get('description'), 2000);
    // Maker-submitted: normalise strict so an invalid/freeform value is
    // rejected rather than persisted outside the controlled vocab.
    const category = normalizeCategory(clean(form.get('category'), 48), 'strict');
    const coverUrl = cleanUrl(form.get('coverUrl'));
    const sourceRepo = cleanUrl(form.get('sourceRepo'));
    const supportEmail = clean(form.get('supportEmail'), 180);
    const privacyPolicyUrl = cleanUrl(form.get('privacyPolicyUrl'));
    const termsUrl = cleanUrl(form.get('termsUrl'));
    const license = clean(form.get('license'), 80);
    const remixAllowed = form.get('remixAllowed') === 'on';

    if (!name) return fail(400, { error: 'Name is required.' });
    if (!category) {
      return fail(400, { error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.` });
    }

    // Icons are ingested to R2 and served same-origin — never hotlinked. http
    // and SVG are rejected (mixed-content / tracking-beacon / XSS). An already
    // same-origin value is kept as-is.
    const rawIcon = clean(form.get('iconUrl'), 500);
    let iconUrl: string | null = null;
    if (rawIcon) {
      if (rawIcon.startsWith('/__shippie/app-icons/')) {
        iconUrl = rawIcon;
      } else if (isIngestableIconUrl(rawIcon) && platform.env.APPS) {
        const ingested = await ingestIcon({ r2: platform.env.APPS, appId: app.id, url: rawIcon });
        if (!ingested.ok) {
          return fail(400, {
            error: `Icon could not be used (${ingested.reason}). Provide an https PNG, WebP, or JPEG under 512 KB.`,
          });
        }
        iconUrl = ingested.url;
      } else {
        return fail(400, { error: 'Icon URL must be an https image (http and SVG are not allowed).' });
      }
    }

    const db = getDrizzleClient(platform.env.DB);
    await db
      .update(schema.apps)
      .set({
        name,
        tagline,
        description,
        category,
        iconUrl,
        screenshotUrls: coverUrl ? [coverUrl] : app.screenshotUrls ?? [],
        githubRepo: sourceRepo,
        supportEmail,
        privacyPolicyUrl,
        termsUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.apps.id, app.id));

    await db
      .insert(schema.appLineage)
      .values({
        appId: app.id,
        sourceRepo,
        license,
        remixAllowed,
      })
      .onConflictDoUpdate({
        target: schema.appLineage.appId,
        set: {
          sourceRepo,
          license,
          remixAllowed,
          updatedAt: new Date().toISOString(),
        },
      });

    return { ok: true };
  },
};

async function loadOwnedApp(input: {
  locals: App.Locals;
  platform: App.Platform | undefined;
  slug: string;
  pathname: string;
}): Promise<AppRow> {
  if (!input.locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(input.pathname)}`);
  }
  if (!input.platform?.env.DB) throw error(500, 'database unavailable');
  const db = getDrizzleClient(input.platform.env.DB);
  const [app] = await db
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.slug, input.slug))
    .limit(1);
  if (!app) throw error(404, 'app not found');
  if (app.makerId !== input.locals.user.id) throw error(403, 'forbidden');
  return app;
}

function clean(value: FormDataEntryValue | null, max: number): string | null {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || null;
}

function cleanUrl(value: FormDataEntryValue | null): string | null {
  const text = clean(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
