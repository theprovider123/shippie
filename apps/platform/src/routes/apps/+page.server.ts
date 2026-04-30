/**
 * Marketplace browse — `/apps`.
 *
 * Empty `q` → top-of-the-marketplace browse, ordered by upvote then
 * install count. Non-empty `q` → FTS5 search. The query string is
 * sanitised in `buildFtsQuery` (see `db/queries/apps.ts`) so we never
 * concatenate user input into a MATCH predicate raw.
 *
 * Pagination strategy: simple offset paging via `?p=` (1-indexed). Cheap
 * for the current catalogue size (28 apps) and bookmarkable. Switching
 * to keyset / infinite-scroll is a Phase 4b polish if/when the catalogue
 * grows past a few hundred.
 */
import type { PageServerLoad } from './$types';
import { inArray } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { browsePublic, searchPublic, listCategories, type KindFilter } from '$server/db/queries/apps';
import { provenBadgesFromAwards } from '$server/marketplace/capability-badges';
import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ platform, url, depends, locals, setHeaders }) => {
  // Tag so VisibilityPicker can `invalidate('app:apps')` after a
  // visibility change without a full reload.
  depends('app:apps');
  if (!platform?.env.DB) {
    return {
      apps: [],
      query: '',
      page: 1,
      hasMore: false,
      categories: [],
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const kindFilterRaw = url.searchParams.get('kind');
  const kindFilter: KindFilter | null =
    kindFilterRaw === 'local' || kindFilterRaw === 'connected' || kindFilterRaw === 'cloud'
      ? kindFilterRaw
      : null;
  const categoryFilter = (url.searchParams.get('category') ?? '').trim() || null;

  // Default browse (no search, no filters, first page) is cacheable for
  // anonymous traffic — that's the bulk of /apps hits. Filtered/searched
  // results vary per request and skip the edge. Logged-in users always
  // skip too because their layout chrome is personalised.
  const isDefaultBrowse = !query && !kindFilter && !categoryFilter && page === 1;
  if (isDefaultBrowse && !locals.user) {
    setHeaders({
      'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    });
  }

  // Filter pushed into the DB query so pagination is correct.
  const [appRows, categories] = await Promise.all([
    query
      ? searchPublic(db, query, { limit: PER_PAGE + 1, offset, kind: kindFilter, category: categoryFilter })
      : browsePublic(db, { limit: PER_PAGE + 1, offset, kind: kindFilter, category: categoryFilter }),
    listCategories(db),
  ]);

  const visible = appRows.slice(0, PER_PAGE);
  const ids = visible.map((a) => a.id).filter((id): id is string => typeof id === 'string');
  const awarded = ids.length
    ? await db
        .select({
          appId: schema.capabilityBadges.appId,
          badge: schema.capabilityBadges.badge,
        })
        .from(schema.capabilityBadges)
        .where(inArray(schema.capabilityBadges.appId, ids))
    : [];
  const byApp = new Map<string, { badge: string }[]>();
  for (const row of awarded) {
    let bucket = byApp.get(row.appId);
    if (!bucket) {
      bucket = [];
      byApp.set(row.appId, bucket);
    }
    bucket.push({ badge: row.badge });
  }
  // Narrow the wide schema column types into the AppKind union the UI expects.
  const isAppKind = (v: string | null): v is AppKind =>
    v === 'local' || v === 'connected' || v === 'cloud';

  const decorated = visible.map((a) => ({
    ...a,
    badges: provenBadgesFromAwards(byApp.get(a.id ?? '') ?? []),
    kind: isAppKind(a.currentDetectedKind) ? a.currentDetectedKind : null,
    kindStatus: (a.currentPublicKindStatus ?? null) as PublicKindStatus | null,
  }));

  const hasMore = appRows.length > PER_PAGE;
  return {
    apps: decorated,
    query,
    page,
    hasMore,
    categories,
    kindFilter,
    categoryFilter,
  };
};
