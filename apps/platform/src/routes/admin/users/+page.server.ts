/**
 * /admin/users — user access management.
 *
 * Lists all platform users with search + pagination. Per-user actions:
 *   - ?/setAdmin — toggle is_admin flag
 *   - ?/suspend  — set suspended_at to now (blocks sign-in)
 *   - ?/unsuspend — clear suspended_at
 */
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, like, or, type SQL } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
  const admin = requireAdmin(event);
  if (!event.platform?.env.DB) {
    return { users: [], total: 0, page: 1, q: '', admin };
  }
  const db = getDrizzleClient(event.platform.env.DB);
  const url = event.url;
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: SQL[] = [];
  if (q) {
    const needle = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const orCond = or(
      like(schema.users.email, needle),
      like(schema.users.username, needle),
      like(schema.users.displayName, needle),
    );
    if (orCond) conditions.push(orCond);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      displayName: schema.users.displayName,
      isAdmin: schema.users.isAdmin,
      verifiedMaker: schema.users.verifiedMaker,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(where)
    .orderBy(desc(schema.users.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return { users: rows, page, q, admin };
};

export const actions: Actions = {
  setAdmin: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const isAdmin = form.get('isAdmin') === 'true';
    if (!id) return fail(400, { error: 'missing id' });
    if (id === admin.id) return fail(400, { error: 'Cannot change your own admin status' });

    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, isAdmin: schema.users.isAdmin })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    if (!user) return fail(404, { error: 'user not found' });

    await db
      .update(schema.users)
      .set({ isAdmin, updatedAt: new Date().toISOString() })
      .where(eq(schema.users.id, id));

    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.user.set_admin',
      targetTable: 'users',
      targetId: id,
      before: { isAdmin: user.isAdmin },
      after: { isAdmin },
    });

    return { ok: true };
  },
};
