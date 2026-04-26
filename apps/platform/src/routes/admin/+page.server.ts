/**
 * /admin — apps moderation list.
 *
 * Loads every app (no visibility/archive filter — admins see all), with
 * a maker join for the username column. Sort + filter happen server-
 * side via search params so deep-links (`?sort=upvotes&q=foo`) survive
 * reloads.
 *
 * Three form actions:
 *   - ?/archive       — set is_archived=true
 *   - ?/unarchive     — set is_archived=false
 *   - ?/setVisibility — public | unlisted | private
 *
 * Every action writes an audit_log row via `recordAudit`. The before/
 * after JSON captures the changed fields only — keeps the metadata
 * column small.
 */
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, like, or, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';

export type AdminAppRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  makerId: string;
  makerUsername: string | null;
  makerEmail: string;
  latestDeployStatus: string | null;
  visibilityScope: string;
  isArchived: boolean;
  themeColor: string;
  upvoteCount: number;
  createdAt: string;
};

type SortKey = 'created' | 'name' | 'upvotes' | 'status' | 'visibility';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'live' | 'building' | 'failed' | 'archived';

const SORT_COLUMN: Record<SortKey, SQLWrapper> = {
  created: schema.apps.createdAt,
  name: schema.apps.name,
  upvotes: schema.apps.upvoteCount,
  status: schema.apps.latestDeployStatus,
  visibility: schema.apps.visibilityScope,
};

function parseSort(raw: string | null): { key: SortKey; dir: SortDir } {
  const allowed: SortKey[] = ['created', 'name', 'upvotes', 'status', 'visibility'];
  const [k, d] = (raw ?? 'created:desc').split(':');
  const key = (allowed.includes(k as SortKey) ? k : 'created') as SortKey;
  const dir: SortDir = d === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

function parseStatus(raw: string | null): StatusFilter {
  const allowed: StatusFilter[] = ['all', 'live', 'building', 'failed', 'archived'];
  return (allowed.includes(raw as StatusFilter) ? raw : 'all') as StatusFilter;
}

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const { platform, url } = event;
  if (!platform?.env.DB) {
    return {
      apps: [] as AdminAppRow[],
      categories: [] as string[],
      filters: { q: '', category: 'all', status: 'all' as StatusFilter, sort: 'created:desc' },
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  const q = (url.searchParams.get('q') ?? '').trim();
  const category = (url.searchParams.get('category') ?? 'all').trim();
  const status = parseStatus(url.searchParams.get('status'));
  const { key: sortKey, dir: sortDir } = parseSort(url.searchParams.get('sort'));

  // Build the predicate.
  const conditions: SQL[] = [];
  if (q.length > 0) {
    const needle = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const orCond = or(
      like(schema.apps.name, needle),
      like(schema.apps.slug, needle),
    );
    if (orCond) conditions.push(orCond);
  }
  if (category && category !== 'all') {
    conditions.push(eq(schema.apps.category, category));
  }
  if (status === 'archived') {
    conditions.push(eq(schema.apps.isArchived, true));
  } else if (status === 'live') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'success'));
    conditions.push(eq(schema.apps.isArchived, false));
  } else if (status === 'building') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'building'));
  } else if (status === 'failed') {
    conditions.push(eq(schema.apps.latestDeployStatus, 'failed'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const sortCol = SORT_COLUMN[sortKey];
  const orderClause = sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      category: schema.apps.category,
      makerId: schema.apps.makerId,
      makerUsername: schema.users.username,
      makerEmail: schema.users.email,
      latestDeployStatus: schema.apps.latestDeployStatus,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      themeColor: schema.apps.themeColor,
      upvoteCount: schema.apps.upvoteCount,
      createdAt: schema.apps.createdAt,
    })
    .from(schema.apps)
    .leftJoin(schema.users, eq(schema.users.id, schema.apps.makerId))
    .where(where)
    .orderBy(orderClause)
    .limit(500);

  // Distinct categories for the filter chip — across ALL apps, not the
  // currently-filtered subset, so admins can pivot freely.
  const categoryRows = await db
    .selectDistinct({ category: schema.apps.category })
    .from(schema.apps);

  const apps: AdminAppRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    makerId: r.makerId,
    makerUsername: r.makerUsername,
    makerEmail: r.makerEmail ?? '',
    latestDeployStatus: r.latestDeployStatus,
    visibilityScope: r.visibilityScope,
    isArchived: r.isArchived,
    themeColor: r.themeColor,
    upvoteCount: r.upvoteCount,
    createdAt: r.createdAt,
  }));

  return {
    apps,
    categories: categoryRows.map((c) => c.category).filter((c): c is string => !!c).sort(),
    filters: { q, category, status, sort: `${sortKey}:${sortDir}` },
  };
};

const VISIBILITY_VALUES = new Set(['public', 'unlisted', 'private']);

export const actions: Actions = {
  archive: async (event) => {
    return setArchived(event, true);
  },
  unarchive: async (event) => {
    return setArchived(event, false);
  },
  setVisibility: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const visibility = String(form.get('visibility') ?? '');
    if (!id) return fail(400, { error: 'missing app id' });
    if (!VISIBILITY_VALUES.has(visibility)) {
      return fail(400, { error: 'invalid visibility' });
    }

    const [before] = await db
      .select({
        id: schema.apps.id,
        slug: schema.apps.slug,
        visibilityScope: schema.apps.visibilityScope,
      })
      .from(schema.apps)
      .where(eq(schema.apps.id, id))
      .limit(1);

    if (!before) return fail(404, { error: 'app not found' });
    if (before.visibilityScope === visibility) {
      return { ok: true, noop: true };
    }

    await db
      .update(schema.apps)
      .set({ visibilityScope: visibility, updatedAt: new Date().toISOString() })
      .where(eq(schema.apps.id, id));

    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.app.set_visibility',
      targetTable: 'apps',
      targetId: id,
      before: { visibilityScope: before.visibilityScope },
      after: { visibilityScope: visibility },
    });

    return { ok: true };
  },
};

async function setArchived(
  event: Parameters<Actions[string]>[0],
  archived: boolean,
) {
  const admin = requireAdmin(event);
  if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
  const db = getDrizzleClient(event.platform.env.DB);

  const form = await event.request.formData();
  const id = String(form.get('id') ?? '');
  if (!id) return fail(400, { error: 'missing app id' });

  const [before] = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      isArchived: schema.apps.isArchived,
    })
    .from(schema.apps)
    .where(eq(schema.apps.id, id))
    .limit(1);

  if (!before) return fail(404, { error: 'app not found' });
  if (before.isArchived === archived) {
    return { ok: true, noop: true };
  }

  await db
    .update(schema.apps)
    .set({ isArchived: archived, updatedAt: new Date().toISOString() })
    .where(eq(schema.apps.id, id));

  await recordAudit(db, {
    actorUserId: admin.id,
    action: archived ? 'admin.app.archive' : 'admin.app.unarchive',
    targetTable: 'apps',
    targetId: id,
    before: { isArchived: before.isArchived },
    after: { isArchived: archived },
  });

  return { ok: true };
}
