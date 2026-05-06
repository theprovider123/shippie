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
import { curatedApps } from '$lib/container/state';
import { getDrizzleClient, schema } from '$server/db/client';
import { browsePublic, searchPublic, listCategories, type KindFilter } from '$server/db/queries/apps';
import { provenBadgesFromAwards } from '$server/marketplace/capability-badges';
import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';

const PER_PAGE = 48;

function marketplaceCategory(category: string | undefined): string {
  if (category === 'cooking') return 'food-drink';
  if (category === 'fitness' || category === 'wellness' || category === 'health') return 'health-fitness';
  if (category === 'journal' || category === 'money') return 'productivity';
  if (category === 'memory' || category === 'home' || category === 'family' || category === 'travel') return 'lifestyle';
  return category ?? 'tools';
}

function fallbackApps() {
  return curatedApps.map((app) => ({
    id: app.id,
    slug: app.slug,
    name: app.name,
    tagline: app.description,
    description: app.description,
    type: 'app',
    category: marketplaceCategory(app.category),
    iconUrl: null,
    themeColor: app.accent,
    upvoteCount: 0,
    installCount: 0,
    compatibilityScore: 100,
    currentDetectedKind: app.appKind,
    currentPublicKindStatus: 'confirmed',
    badges: [],
    kind: app.appKind,
    kindStatus: 'confirmed' as PublicKindStatus,
  }));
}

function filteredFallbackApps(
  query: string,
  kindFilter: KindFilter | null,
  categoryFilter: string | null,
) {
  const fallback = fallbackApps();
  const filtered = fallback.filter((app) => {
    const haystack = `${app.name} ${app.tagline ?? ''} ${app.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query.toLowerCase());
    const matchesKind = !kindFilter || app.kind === kindFilter;
    const matchesCategory = !categoryFilter || app.category === categoryFilter;
    return matchesQuery && matchesKind && matchesCategory;
  });
  return {
    apps: filtered,
    categories: [...new Set(fallback.map((app) => app.category))].sort(),
  };
}

export const load: PageServerLoad = async ({ platform, url, depends, locals, setHeaders }) => {
  // Tag so VisibilityPicker can `invalidate('app:apps')` after a
  // visibility change without a full reload.
  depends('app:apps');

  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const kindFilterRaw = url.searchParams.get('kind');
  const kindFilter: KindFilter | null =
    kindFilterRaw === 'local' || kindFilterRaw === 'connected' || kindFilterRaw === 'cloud'
      ? kindFilterRaw
      : null;
  const categoryFilter = (url.searchParams.get('category') ?? '').trim() || null;
  if (!platform?.env.DB) {
    const fallback = filteredFallbackApps(query, kindFilter, categoryFilter);
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: fallback.categories,
      kindFilter,
      categoryFilter,
    };
  }

  const db = getDrizzleClient(platform.env.DB);

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

  if (appRows.length === 0) {
    const fallback = filteredFallbackApps(query, kindFilter, categoryFilter);
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: categories.length > 0 ? categories : fallback.categories,
      kindFilter,
      categoryFilter,
    };
  }

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
