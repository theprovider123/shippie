import { fail } from '@sveltejs/kit';
import { and, desc, eq, inArray, like, or, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { getDrizzleClient, schema } from '$server/db/client';

const MODERATION_STATUSES = new Set(['open', 'reviewing', 'hidden', 'resolved', 'spam']);

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  if (!event.platform?.env.DB) return { items: [], filters: { status: 'all', q: '', appSlug: '' } };
  const db = getDrizzleClient(event.platform.env.DB);

  const url = event.url;
  const filterStatus = (url.searchParams.get('status') ?? 'all').toLowerCase();
  const q = (url.searchParams.get('q') ?? '').trim();
  const appSlug = (url.searchParams.get('appSlug') ?? '').trim();

  const conditions: (SQL | SQLWrapper)[] = [];
  if (filterStatus !== 'all' && MODERATION_STATUSES.has(filterStatus)) {
    conditions.push(eq(schema.feedbackItems.status, filterStatus));
  }
  if (appSlug) {
    conditions.push(eq(schema.apps.slug, appSlug));
  }
  if (q) {
    const needle = `%${q}%`;
    const text = or(
      like(schema.feedbackItems.title, needle),
      like(schema.feedbackItems.body, needle),
      like(schema.feedbackItems.externalUserDisplay, needle),
      like(schema.users.email, needle),
    );
    if (text) conditions.push(text);
  }

  const baseQuery = db
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
    .innerJoin(schema.users, eq(schema.users.id, schema.apps.makerId));

  const filtered =
    conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

  const items = await filtered
    .orderBy(desc(schema.feedbackItems.createdAt))
    .limit(200);

  return {
    items,
    filters: { status: filterStatus, q, appSlug },
  };
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

  /**
   * Bulk-update status across many feedback items at once. Used for spam
   * waves: select N rows in the UI, hit one button, every item gets the
   * same new status and a separate audit_log row per item.
   */
  bulkSetStatus: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const form = await event.request.formData();
    const status = String(form.get('status') ?? '');
    if (!MODERATION_STATUSES.has(status)) return fail(400, { error: 'invalid status' });

    // FormData allows multiple values for the same key — `getAll` collects
    // every selected feedback id checkbox in the bulk panel.
    const ids = form
      .getAll('id')
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    if (ids.length === 0) return fail(400, { error: 'no ids selected' });
    if (ids.length > 200) return fail(400, { error: 'too many ids in one batch' });

    const db = getDrizzleClient(event.platform.env.DB);
    const before = await db
      .select({ id: schema.feedbackItems.id, status: schema.feedbackItems.status })
      .from(schema.feedbackItems)
      .where(inArray(schema.feedbackItems.id, ids));

    const now = new Date().toISOString();
    await db
      .update(schema.feedbackItems)
      .set({ status, updatedAt: now })
      .where(inArray(schema.feedbackItems.id, ids));

    // One audit row per item so the trail tells you which IDs changed in
    // this batch, not just "200 items changed at 12:34".
    for (const row of before) {
      if (row.status === status) continue;
      await recordAudit(db, {
        actorUserId: admin.id,
        action: 'feedback.moderate.bulk',
        targetTable: 'feedback_items',
        targetId: row.id,
        before: { status: row.status },
        after: { status },
      });
    }

    return { ok: true, count: before.length };
  },
};
