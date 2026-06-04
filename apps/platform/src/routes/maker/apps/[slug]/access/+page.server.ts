/**
 * /maker/apps/[slug]/access — visibility + invites management.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { parseSpaces } from '$server/deploy/manifest';
import { saveMakerAppProfile } from '$server/maker/profile-save';
import { archiveSpaceForApp, listSpacesForApp, summariseSpaceMetrics } from '$server/spaces/private-spaces';
import type { App as AppRow } from '$server/db/schema/apps';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) {
    return {
      ...layout,
      invites: [],
      access: [],
      lineage: null,
      privateSpaces: [],
      privateSpaceMetrics: summariseSpaceMetrics([]),
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const invites = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.appId, layout.app.id))
    .orderBy(schema.appInvites.createdAt);

  const access = await db
    .select()
    .from(schema.appAccess)
    .where(eq(schema.appAccess.appId, layout.app.id));
  const [lineage] = await db
    .select()
    .from(schema.appLineage)
    .where(eq(schema.appLineage.appId, layout.app.id))
    .limit(1);

  const [deploy] = layout.app.activeDeployId
    ? await db
        .select({ shippieJson: schema.deploys.shippieJson })
        .from(schema.deploys)
        .where(eq(schema.deploys.id, layout.app.activeDeployId))
        .limit(1)
    : [];
  const spaces = parseSpaces((deploy?.shippieJson as Record<string, unknown> | undefined)?.spaces) ?? null;
  const privateSpaces = await listSpacesForApp(layout.app.id, platform.env.DB);
  const privateSpaceMetrics = summariseSpaceMetrics(privateSpaces);

  return { ...layout, invites, access, lineage: lineage ?? null, spaces, privateSpaces, privateSpaceMetrics };
};

export const actions: Actions = {
  save: saveMakerAppProfile,

  archiveSpace: async ({ request, locals, params, platform, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const app = await loadOwnedApp({
      locals,
      platform,
      slug: params.slug,
      pathname: url.pathname,
    });
    const form = await request.formData();
    const spaceId = cleanSpaceId(form.get('spaceId'));
    if (!spaceId) return fail(400, { error: 'space id required' });
    const archived = await archiveSpaceForApp({
      db: platform.env.DB,
      appId: app.id,
      spaceId,
      actorId: locals.user!.id,
      reason: cleanText(form.get('reason'), 240),
    });
    if (!archived) return fail(404, { error: 'space not found or already archived' });
    return { ok: true, archivedSpaceId: spaceId };
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

function cleanSpaceId(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{3,80}$/.test(raw) ? raw : null;
}

function cleanText(value: FormDataEntryValue | null, max: number): string | null {
  const raw = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return raw || null;
}
