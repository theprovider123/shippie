/**
 * Enhancements tab — auto-detected capabilities + opt-in catalog +
 * shippie.json override editor.
 *
 * Ports apps/web/app/dashboard/[appSlug]/enhancements/page.tsx + actions.ts.
 *
 * Auth + ownership are handled by the parent layout
 * (`dashboard/apps/[slug]/+layout.server.ts`). This load just reads the
 * AppProfile and the maker's stored shippie.json override from KV.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import type { AppProfile } from '@shippie/analyse';
import { getDrizzleClient, schema } from '$server/db/client';
import {
  readAppProfile,
  readShippieJsonOverride,
  writeShippieJsonOverride,
  clearShippieJsonOverride,
} from '$server/deploy/kv-write';
import { validateShippieJsonOverride } from '$server/deploy/shippie-json-validation';
import {
  CAPABILITY_CATALOG,
  extractEnabledCapabilityIds,
  type CapabilityEntry,
} from '$server/marketplace/enhancement-catalog';

/**
 * Re-verify ownership for the action handlers. Actions don't get
 * `parent()` so we can't lean on the layout's check — duplicate the gate
 * here. Returns the slug + makerId on success or throws redirect/error.
 */
async function requireMakerOwnsApp(
  locals: App.Locals,
  platform: App.Platform | undefined,
  slug: string,
  pathname: string,
): Promise<{ userId: string }> {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(pathname)}`);
  }
  if (!platform?.env.DB) throw error(500, 'database unavailable');
  const db = getDrizzleClient(platform.env.DB);
  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) throw error(404, 'app not found');
  if (app.makerId !== locals.user.id) throw error(403, 'forbidden');
  return { userId: locals.user.id };
}

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.CACHE) {
    throw error(503, 'kv binding unavailable');
  }

  const slug = layout.app.slug;
  const [profileRaw, shippieJson] = await Promise.all([
    readAppProfile(platform.env.CACHE, slug),
    readShippieJsonOverride(platform.env.CACHE, slug),
  ]);

  const profile = (profileRaw as AppProfile | null) ?? null;

  // Flatten the recommended.enhance map into a list for rendering.
  const detected: Array<{ selector: string; rule: string }> = [];
  if (profile) {
    for (const [selector, rules] of Object.entries(profile.recommended.enhance)) {
      for (const rule of rules) detected.push({ selector, rule });
    }
  }

  const enabled = new Set(extractEnabledCapabilityIds(shippieJson));
  const available: CapabilityEntry[] = CAPABILITY_CATALOG.filter(
    (c) => !enabled.has(c.id),
  );

  return {
    profile,
    detected,
    available,
    shippieJson,
    initialJsonText: JSON.stringify(shippieJson ?? {}, null, 2),
  };
};

export const actions: Actions = {
  /**
   * Save raw shippie.json text. Returns ?/save with `error` on failure
   * or `saved: true` on success.
   */
  save: async ({ request, locals, platform, params, url }) => {
    await requireMakerOwnsApp(locals, platform, params.slug, url.pathname);
    if (!platform?.env.CACHE) return fail(503, { error: 'kv binding unavailable' });

    const form = await request.formData();
    const raw = String(form.get('shippieJson') ?? '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return fail(400, { error: `Invalid JSON: ${(e as Error).message}`, text: raw });
    }
    const validated = validateShippieJsonOverride(parsed);
    if (!validated.ok) {
      return fail(400, { error: validated.error, text: raw });
    }

    await writeShippieJsonOverride(platform.env.CACHE, params.slug, validated.value);
    return { saved: true };
  },

  /**
   * Reset — clears the maker's override. Next deploy uses whatever's in
   * the zip plus auto-drafted defaults.
   */
  reset: async ({ locals, platform, params, url }) => {
    await requireMakerOwnsApp(locals, platform, params.slug, url.pathname);
    if (!platform?.env.CACHE) return fail(503, { error: 'kv binding unavailable' });
    await clearShippieJsonOverride(platform.env.CACHE, params.slug);
    return { saved: true, reset: true };
  },
};
