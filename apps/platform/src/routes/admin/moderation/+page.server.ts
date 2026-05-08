import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { getDrizzleClient, schema } from '$server/db/client';

const MODERATION_STATUSES = new Set(['open', 'reviewing', 'hidden', 'resolved', 'spam']);

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  if (!event.platform?.env.DB) return { items: [] };
  const db = getDrizzleClient(event.platform.env.DB);
  const items = await db
    .select({
      id: schema.feedbackItems.id,
      appId: schema.feedbackItems.appId,
      appName: schema.apps.name,
      appSlug: schema.apps.slug,
      makerEmail: schema.users.email,
      type: schema.feedbackItems.type,
      status: schema.feedbackItems.status,
      rating: schema.feedbackItems.rating,
      title: schema.feedbackItems.title,
      body: schema.feedbackItems.body,
      voteCount: schema.feedbackItems.voteCount,
      metadata: schema.feedbackItems.metadata,
      createdAt: schema.feedbackItems.createdAt,
      updatedAt: schema.feedbackItems.updatedAt,
    })
    .from(schema.feedbackItems)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.feedbackItems.appId))
    .innerJoin(schema.users, eq(schema.users.id, schema.apps.makerId))
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(200);

  return { items };
};

export const actions: Actions = {
  setStatus: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const status = String(form.get('status') ?? '');
    if (!id || !MODERATION_STATUSES.has(status)) return fail(400, { error: 'invalid status' });

    const db = getDrizzleClient(event.platform.env.DB);
    const [before] = await db
      .select({ id: schema.feedbackItems.id, status: schema.feedbackItems.status })
      .from(schema.feedbackItems)
      .where(eq(schema.feedbackItems.id, id))
      .limit(1);
    if (!before) return fail(404, { error: 'feedback not found' });

    await db
      .update(schema.feedbackItems)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(schema.feedbackItems.id, id));
    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'feedback.moderate',
      targetTable: 'feedback_items',
      targetId: id,
      before: { status: before.status },
      after: { status },
    });

    return { ok: true };
  },
};
