/**
 * /maker/apps — full apps list with server-side search, filter, sort, and
 * pagination.
 *
 * Owns its own query (the layout only loads recents + counts), so the full
 * list is fetched only when this page is viewed, and only one page at a time.
 * Scales to accounts with thousands of apps.
 */
import { and, asc, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { emptyDemoDiagnostics, loadDemoDiagnostics } from '$server/maker/diagnostics';
import type { MyAppRow } from '../+layout.server';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = ['all', 'live', 'building', 'failed', 'draft'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const VISIBILITY_OPTIONS = ['all', 'public', 'unlisted', 'private', 'team'] as const;
type VisibilityFilter = (typeof VISIBILITY_OPTIONS)[number];

const SORT_COLUMNS = {
  updated: schema.apps.updatedAt,
  name: schema.apps.name,
  deployed: schema.apps.lastDeployedAt,
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

function parseStatus(raw: string | null): StatusFilter {
  return STATUS_OPTIONS.includes(raw as StatusFilter) ? (raw as StatusFilter) : 'all';
}

function parseVisibility(raw: string | null): VisibilityFilter {
  return VISIBILITY_OPTIONS.includes(raw as VisibilityFilter) ? (raw as VisibilityFilter) : 'all';
}

function parseSort(raw: string | null): { key: SortKey; dir: 'asc' | 'desc' } {
  const [keyPart, dirPart] = (raw ?? '').split(':');
  const key: SortKey = keyPart in SORT_COLUMNS ? (keyPart as SortKey) : 'updated';
  const dir = dirPart === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

export const load: PageServerLoad = async ({ parent, platform, url }) => {
  const { user } = await parent();

  const q = (url.searchParams.get('q') ?? '').trim();
  const status = parseStatus(url.searchParams.get('status'));
  const visibility = parseVisibility(url.searchParams.get('visibility'));
  const sort = parseSort(url.searchParams.get('sort'));
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const filters = { q, status, visibility, sort: `${sort.key}:${sort.dir}`, page };

  if (!platform?.env.DB) {
    return {
      apps: [] as MyAppRow[],
      total: 0,
      pageSize: PAGE_SIZE,
      filters,
      demoDiagnostics: emptyDemoDiagnostics(),
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  const conditions: SQL[] = [
    eq(schema.apps.makerId, user.id),
    eq(schema.apps.isArchived, false),
  ];

  if (q.length > 0) {
    const needle = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const search = or(like(schema.apps.name, needle), like(schema.apps.slug, needle));
    if (search) conditions.push(search);
  }

  if (status === 'live') conditions.push(eq(schema.apps.latestDeployStatus, 'success'));
  else if (status === 'building') conditions.push(eq(schema.apps.latestDeployStatus, 'building'));
  else if (status === 'failed') conditions.push(eq(schema.apps.latestDeployStatus, 'failed'));
  else if (status === 'draft') conditions.push(isNull(schema.apps.latestDeployStatus));

  if (visibility !== 'all') conditions.push(eq(schema.apps.visibilityScope, visibility));

  const where = and(...conditions);
  const orderColumn = SORT_COLUMNS[sort.key];
  const orderBy = sort.dir === 'asc' ? asc(orderColumn) : desc(orderColumn);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.apps)
    .where(where);
  const total = Number(countRow?.total ?? 0);

  const apps = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      type: schema.apps.type,
      themeColor: schema.apps.themeColor,
      latestDeployStatus: schema.apps.latestDeployStatus,
      visibilityScope: schema.apps.visibilityScope,
      lastDeployedAt: schema.apps.lastDeployedAt,
    })
    .from(schema.apps)
    .where(where)
    .orderBy(orderBy, desc(schema.apps.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return {
    apps,
    total,
    pageSize: PAGE_SIZE,
    filters,
    demoDiagnostics: await loadDemoDiagnostics(db, user.id),
  };
};
