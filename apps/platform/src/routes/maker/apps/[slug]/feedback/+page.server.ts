/**
 * Per-app feedback inbox.
 *
 * Loads feedback for a single app (the one whose ownership the parent
 * layout already verified). Mirrors the all-apps view at
 * /dashboard/feedback but with one app's items and richer status
 * breakdown so the maker can sit on a specific app and triage.
 *
 * Status semantics match the platform-wide moderation contract:
 *   open      — public-visible
 *   reviewing — auto-flagged, held until admin clears
 *   spam      — auto-flagged as spam, held until admin clears
 *   hidden    — admin or maker hid it (still visible to maker for context)
 *   resolved  — maker marked it done
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) return { ...layout, items: [] };

  const db = getDrizzleClient(platform.env.DB);
  const items = await db
    .select({
      id: schema.feedbackItems.id,
      type: schema.feedbackItems.type,
      status: schema.feedbackItems.status,
      rating: schema.feedbackItems.rating,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      voteCount: schema.feedbackItems.voteCount,
      externalUserDisplay: schema.feedbackItems.externalUserDisplay,
      metadata: schema.feedbackItems.metadata,
      createdAt: schema.feedbackItems.createdAt,
    })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.appId, layout.app.id))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(200);

  return { ...layout, items };
};

export const actions: Actions = {
  setStatus: async ({ request, locals, params, platform, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'database unavailable' });
    if (!locals.user) {
      throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
    }
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const status = String(form.get('status') ?? '');
    const allowed = new Set(['open', 'hidden', 'resolved']);
    if (!id || !allowed.has(status)) {
      return fail(400, { error: 'Invalid feedback status.' });
    }

    const db = getDrizzleClient(platform.env.DB);
    const [app] = await db
      .select({ id: schema.apps.id, makerId: schema.apps.makerId })
      .from(schema.apps)
      .where(eq(schema.apps.slug, params.slug))
      .limit(1);
    if (!app || app.makerId !== locals.user.id) {
      return fail(403, { error: 'forbidden' });
    }
    await db
      .update(schema.feedbackItems)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.feedbackItems.id, id), eq(schema.feedbackItems.appId, app.id)));

    return { ok: true };
  },
};
