/**
 * Per-app overview — recent deploys + visibility + App Kind summary +
 * App Kind actions (dispute / clear dispute / save workflow probes).
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import {
  readAppKindProfile,
  writeAppKindProfile,
  readShippieJsonOverride,
  writeShippieJsonOverride,
} from '$server/deploy/kv-write';
import type { AppKindProfile, PublicKindStatus } from '$lib/types/app-kind';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) return { ...layout, deploys: [], kindProfile: null, workflowProbes: [] };

  const db = getDrizzleClient(platform.env.DB);
  const deploys = await db
    .select({
      id: schema.deploys.id,
      version: schema.deploys.version,
      status: schema.deploys.status,
      sourceType: schema.deploys.sourceType,
      durationMs: schema.deploys.durationMs,
      createdAt: schema.deploys.createdAt,
      completedAt: schema.deploys.completedAt,
    })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, layout.app.id))
    .orderBy(desc(schema.deploys.createdAt))
    .limit(10);

  const kindProfile = platform.env.CACHE
    ? await readAppKindProfile(platform.env.CACHE, layout.app.slug)
    : null;

  // Workflow probes are stored on the maker's shippie.json override —
  // applied to the next deploy and persisted with the kind profile.
  const override = platform.env.CACHE
    ? await readShippieJsonOverride(platform.env.CACHE, layout.app.slug)
    : null;
  const workflowProbes = Array.isArray(override?.workflow_probes)
    ? (override?.workflow_probes as string[])
    : [];

  return { ...layout, deploys, kindProfile, workflowProbes };
};

async function requireOwner(
  locals: App.Locals,
  platform: App.Platform | undefined,
  slug: string,
  pathname: string,
): Promise<{ appId: string }> {
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
  return { appId: app.id };
}

async function setKindStatus(
  platform: App.Platform | undefined,
  slug: string,
  appId: string,
  newStatus: PublicKindStatus,
  disputeReason?: string,
): Promise<void> {
  if (!platform?.env.DB) return;
  const db = getDrizzleClient(platform.env.DB);
  await db
    .update(schema.apps)
    .set({ currentPublicKindStatus: newStatus })
    .where(eq(schema.apps.id, appId));

  if (platform.env.CACHE) {
    const profile = (await readAppKindProfile(platform.env.CACHE, slug)) as
      | AppKindProfile
      | null;
    if (profile) {
      await writeAppKindProfile(platform.env.CACHE, slug, {
        ...profile,
        publicKindStatus: newStatus,
        ...(disputeReason ? { disputeReason } : {}),
      });
    }
  }
}

export const actions: Actions = {
  disputeKind: async ({ request, locals, platform, params, url }) => {
    const { appId } = await requireOwner(locals, platform, params.slug!, url.pathname);
    const form = await request.formData();
    const reason = (form.get('reason') as string | null)?.slice(0, 500) ?? '';
    if (!reason || reason.trim().length < 10) {
      return fail(400, { disputeError: 'Tell us why in at least 10 characters.' });
    }
    await setKindStatus(platform, params.slug!, appId, 'disputed', reason.trim());
    return { disputeOk: true };
  },

  clearDispute: async ({ locals, platform, params, url }) => {
    const { appId } = await requireOwner(locals, platform, params.slug!, url.pathname);
    await setKindStatus(platform, params.slug!, appId, 'estimated');
    return { clearOk: true };
  },

  saveWorkflowProbes: async ({ request, locals, platform, params, url }) => {
    await requireOwner(locals, platform, params.slug!, url.pathname);
    if (!platform?.env.CACHE) throw error(503, 'kv binding unavailable');
    const form = await request.formData();
    const raw = (form.get('probes') as string | null) ?? '';
    const probes = raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 200)
      .slice(0, 16);

    const existing =
      (await readShippieJsonOverride(platform.env.CACHE, params.slug!)) ?? {};
    const next = { ...existing, workflow_probes: probes };
    await writeShippieJsonOverride(platform.env.CACHE, params.slug!, next);
    return { probesOk: true, probesSaved: probes.length };
  },
};
