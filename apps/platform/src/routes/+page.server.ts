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
import { curatedAppsBySurface } from '$lib/container/state';
import { isFirstPartyShowcase } from '$lib/showcase-slugs';
import { getDrizzleClient, schema } from '$server/db/client';
import { browsePublic, searchPublic, listCategories, type FeaturedApp } from '$server/db/queries/apps';
import { provenBadgesFromAwards } from '$server/marketplace/capability-badges';
import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';

const PER_PAGE = 48;

/**
 * The 8 tools featured on the launcher's first-visit shelf. Curated by hand
 * — we want the strongest demos first, not whatever sorts to the top.
 * Replace freely as new polished tools come online.
 */
const LAUNCHER_FEATURED_SLUGS = [
  'crewtrip',
  'recipe',
  'coffee',
  'dough',
  'cooking',
  'sip-log',
  'quiet',
  'habit-tracker',
] as const;

function marketplaceCategory(category: string | undefined): string {
  if (category === 'cooking') return 'food-drink';
  if (category === 'fitness' || category === 'wellness' || category === 'health') return 'health-fitness';
  if (category === 'journal' || category === 'money') return 'productivity';
  if (category === 'memory' || category === 'home' || category === 'family' || category === 'travel') return 'lifestyle';
  return category ?? 'tools';
}

function fallbackApps() {
  // Marketplace home shows featured + arcade together so "games" sits
  // alongside "tools" / "social" as a normal category chip. Archived
  // (e.g. live-room → matchday) and labs entries still live on their
  // own routes.
  return [...curatedAppsBySurface('featured'), ...curatedAppsBySurface('arcade')].map((app) => ({
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
    firstPartySigned: true,
  }));
}

function filteredFallbackApps(
  query: string,
  categoryFilter: string | null,
) {
  const fallback = fallbackApps();
  const filtered = fallback.filter((app) => {
    const haystack = `${app.name} ${app.tagline ?? ''} ${app.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query.toLowerCase());
    const matchesCategory = !categoryFilter || app.category === categoryFilter;
    return matchesQuery && matchesCategory;
  });
  return {
    apps: filtered,
    categories: [...new Set(fallback.map((app) => app.category))].sort(),
  };
}

function mergeWithBundledApps(
  rows: FeaturedApp[],
  query: string,
  categoryFilter: string | null,
) {
  const seen = new Set(rows.map((app) => app.slug));
  const fallback = filteredFallbackApps(query, categoryFilter).apps.filter((app) => !seen.has(app.slug));
  return [...rows, ...fallback];
}

export const load: PageServerLoad = async ({ platform, url, depends, locals, setHeaders }) => {
  // Tag so VisibilityPicker can `invalidate('app:apps')` after a
  // visibility change without a full reload.
  depends('app:apps');

  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const categoryFilter = (url.searchParams.get('category') ?? '').trim() || null;
  if (!platform?.env.DB) {
    const fallback = filteredFallbackApps(query, categoryFilter);
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      featured: [],
      topFourSlugs: [] as string[],
      suggestionPool: fallbackApps().slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: fallback.categories,
      kindFilter: null,
      categoryFilter,
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  // Shell HTML must stay fresh. Stale PWA/launcher documents are the
  // fastest route to "Something went wrong" because they can reference
  // chunks from an older deploy. Cache the immutable assets aggressively;
  // keep the document itself network-first.
  const isDefaultBrowse = !query && !categoryFilter && page === 1;
  setHeaders({ 'cache-control': 'no-store' });

  // Filter pushed into the DB query so pagination is correct.
  let dbRows: FeaturedApp[];
  let dbCategories: string[];
  try {
    [dbRows, dbCategories] = await Promise.all([
      query
        ? searchPublic(db, query, { limit: PER_PAGE + 1, offset, category: categoryFilter })
        : browsePublic(db, { limit: PER_PAGE + 1, offset, category: categoryFilter }),
      listCategories(db),
    ]);
  } catch {
    const fallback = filteredFallbackApps(query, categoryFilter);
    const visible = fallback.apps.slice(offset, offset + PER_PAGE);
    return {
      apps: visible,
      featured: isDefaultBrowse
        ? LAUNCHER_FEATURED_SLUGS
            .map((slug) => visible.find((app) => app.slug === slug))
            .filter((app): app is (typeof visible)[number] => Boolean(app))
        : [],
      topFourSlugs: isDefaultBrowse
        ? LAUNCHER_FEATURED_SLUGS
            .map((slug) => visible.find((app) => app.slug === slug))
            .filter((app): app is (typeof visible)[number] => Boolean(app))
            .slice(0, 4)
            .map((app) => app.slug)
        : [],
      suggestionPool: fallbackApps().slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: fallback.categories,
      kindFilter: null,
      categoryFilter,
    };
  }

  const fallback = filteredFallbackApps(query, categoryFilter);
  const categories = [...new Set([...dbCategories, ...fallback.categories])].sort();
  const appRows = offset === 0 ? mergeWithBundledApps(dbRows, query, categoryFilter) : dbRows;

  if (appRows.length === 0) {
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      featured: [],
      topFourSlugs: [] as string[],
      suggestionPool: fallbackApps().slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories,
      kindFilter: null,
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
    firstPartySigned: isFirstPartyShowcase(a.slug),
  }));

  const hasMore = appRows.length > PER_PAGE;

  // First-shelf curation: featured tools come first when the user hasn't
  // searched/filtered. `isDefaultBrowse` is already declared above for the
  // cache-control decision; reuse it. Filter is defensive — missing slugs
  // (e.g. retired showcases) silently drop out rather than crash.
  const featured = isDefaultBrowse
    ? LAUNCHER_FEATURED_SLUGS
        .map((slug) => decorated.find((app) => app.slug === slug))
        .filter((app): app is (typeof decorated)[number] => Boolean(app))
    : [];
  const topFourSlugs = featured.slice(0, 4).map((app) => app.slug);

  // Suggestion pool for the empty-search fallback. Always populated so
  // the client-side resolver has something to score against, even on
  // queries that hit zero rows from the DB filter.
  const suggestionPool = fallbackApps().slice(0, 12);

  return {
    apps: decorated,
    featured,
    topFourSlugs,
    suggestionPool,
    query,
    page,
    hasMore,
    categories,
    kindFilter: null,
    categoryFilter,
  };
};
