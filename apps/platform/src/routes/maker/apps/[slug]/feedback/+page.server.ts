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
import { isMakerStatus, MAX_MAKER_REPLY_LEN } from '$lib/feedback/status';

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
      makerReply: schema.feedbackItems.makerReply,
      makerReplyAt: schema.feedbackItems.makerReplyAt,
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
  // Set a feedback item's triage status (open/planned/fixed/closed) and/or its
  // short maker reply in one save. Only the owner of the app may triage.
  triage: async ({ request, locals, params, platform, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'database unavailable' });
    if (!locals.user) {
      throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
    }
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const status = String(form.get('status') ?? '');
    const replyRaw = form.get('reply');
    const reply = typeof replyRaw === 'string' ? replyRaw.trim().slice(0, MAX_MAKER_REPLY_LEN) : '';
    if (!id) return fail(400, { error: 'Missing feedback id.' });
    if (status && !isMakerStatus(status)) return fail(400, { error: 'Invalid status.' });

    const db = getDrizzleClient(platform.env.DB);
    const [app] = await db
      .select({ id: schema.apps.id, makerId: schema.apps.makerId })
      .from(schema.apps)
      .where(eq(schema.apps.slug, params.slug))
      .limit(1);
    if (!app || app.makerId !== locals.user.id) {
      return fail(403, { error: 'forbidden' });
    }

    const now = new Date().toISOString();
    const update: {
      updatedAt: string;
      status?: string;
      makerReply: string | null;
      makerReplyAt: string | null;
    } = {
      updatedAt: now,
      makerReply: reply.length > 0 ? reply : null,
      makerReplyAt: reply.length > 0 ? now : null,
    };
    if (status) update.status = status;

    await db
      .update(schema.feedbackItems)
      .set(update)
      .where(and(eq(schema.feedbackItems.id, id), eq(schema.feedbackItems.appId, app.id)));

    return { ok: true };
  },
};
