/**
 * Tools browse — `/tools`.
 *
 * Empty `q` → top-of-tools browse, ordered by upvote then
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
import { curatedApps, curatedAppsBySurface } from '$lib/container/state';
import { PUBLIC_FLAGSHIP_SLUGS } from '$lib/_generated/first-party-curation';
import { isFirstPartyShowcase } from '$lib/showcase-slugs';
import { getDrizzleClient, schema } from '$server/db/client';
import { browsePublic, curationOverrides, searchPublic, listCategories, type FeaturedApp } from '$server/db/queries/apps';
import { provenBadgesFromAwards } from '$server/marketplace/capability-badges';
import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';
import {
  buildLauncherVisibleSlugSet,
  filterCanonicalLauncherItems,
  launcherPhase,
  mergeCatalog,
  type CurationOverrides,
  type LauncherPhase,
  type LauncherRowShape,
} from '$lib/launcher';
import { TOOLS_PAGE_SIZE } from '$lib/components/tool-surface/scale';

const PER_PAGE = TOOLS_PAGE_SIZE;

const LAUNCHER_FEATURED_SLUGS_BY_PHASE: Record<LauncherPhase, readonly string[]> = {
  prelaunch: PUBLIC_FLAGSHIP_SLUGS,
  'world-cup': PUBLIC_FLAGSHIP_SLUGS,
};
const curatedCopyBySlug = new Map(curatedApps.map((app) => [app.slug, app.description]));

/**
 * Build the set of canonical slugs that should appear on launcher
 * surfaces in the given phase, applying SLUG_ALIASES, archived rules,
 * and upcoming-promotion. Both `+page.server.ts` and the focused-mode
 * drawer pass through this same gate so they cannot drift.
 */
function visibleLauncherSlugs(
  phase: LauncherPhase,
  rows: readonly LauncherRowShape[] = [],
  overrides?: CurationOverrides,
): Set<string> {
  return buildLauncherVisibleSlugSet(mergeCatalog(curatedApps, rows, overrides), phase);
}

function launcherVisible<T extends LauncherRowShape>(
  apps: T[],
  phase: LauncherPhase,
  overrides?: CurationOverrides,
): T[] {
  return filterCanonicalLauncherItems(apps, visibleLauncherSlugs(phase, apps, overrides));
}

function orderedFeatured<T extends { slug: string }>(apps: T[], slugs: readonly string[]): T[] {
  return slugs
    .map((slug) => apps.find((app) => app.slug === slug))
    .filter((app): app is T => Boolean(app));
}

function marketplaceCategory(category: string | undefined): string {
  if (category === 'cooking') return 'food-drink';
  if (category === 'fitness' || category === 'wellness' || category === 'health') return 'health-fitness';
  if (category === 'journal' || category === 'money') return 'productivity';
  if (category === 'memory' || category === 'home' || category === 'family' || category === 'travel') return 'lifestyle';
  return category ?? 'tools';
}

function fallbackApps(phase: LauncherPhase, overrides?: CurationOverrides) {
  // Marketplace home shows featured + arcade together so "games" sits
  // alongside "tools" / "social" as a normal category chip. Archived
  // (e.g. live-room → matchday) and labs entries still live on their
  // own routes.
  return launcherVisible([...curatedAppsBySurface('featured'), ...curatedAppsBySurface('arcade')].map((app) => ({
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
  })), phase, overrides);
}

function filteredFallbackApps(
  query: string,
  categoryFilter: string | null,
  phase: LauncherPhase,
  remixableFilter = false,
  overrides?: CurationOverrides,
) {
  const fallback = fallbackApps(phase, overrides);
  // Hoist `query.toLowerCase()` out of the per-app loop — it's stable
  // for the lifetime of this filter.
  const lowerQuery = query.toLowerCase();
  const filtered = fallback.filter((app) => {
    const haystack = `${app.name} ${app.tagline ?? ''} ${app.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(lowerQuery);
    const matchesCategory = !categoryFilter || app.category === categoryFilter;
    const matchesRemixable = !remixableFilter || isFirstPartyShowcase(app.slug);
    return matchesQuery && matchesCategory && matchesRemixable;
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
  remixableFilter: boolean,
  phase: LauncherPhase,
  overrides?: CurationOverrides,
) {
  const visibleRows = launcherVisible(rows, phase, overrides);
  const hydratedRows = visibleRows.map((app) => {
    const curatedCopy = curatedCopyBySlug.get(app.slug);
    if (!curatedCopy || app.tagline || app.description) return app;
    return { ...app, tagline: curatedCopy, description: curatedCopy };
  });
  const seen = new Set(hydratedRows.map((app) => app.slug));
  const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter, overrides).apps.filter((app) => !seen.has(app.slug));
  return [...hydratedRows, ...fallback];
}

export const load: PageServerLoad = async ({ platform, url, depends, locals, setHeaders }) => {
  // Tag so VisibilityPicker can `invalidate('app:apps')` after a
  // visibility change without a full reload.
  depends('app:apps');

  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const categoryFilter = (url.searchParams.get('category') ?? '').trim() || null;
  const remixableFilter = url.searchParams.get('remixable') === '1';
  const isDefaultBrowse = !query && !categoryFilter && !remixableFilter && page === 1;
  const phase = launcherPhase(new Date());
  const featuredSlugs = LAUNCHER_FEATURED_SLUGS_BY_PHASE[phase];
  if (!platform?.env.DB) {
    const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter);
    const visible = fallback.apps.slice(offset, offset + PER_PAGE);
    const featured = isDefaultBrowse ? orderedFeatured(visible, featuredSlugs) : [];
    return {
      apps: visible,
      featured,
      topFourSlugs: featured.slice(0, 4).map((app) => app.slug),
      suggestionPool: fallbackApps(phase).slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: fallback.categories,
      kindFilter: null,
      categoryFilter,
      remixableFilter,
    };
  }

  const db = getDrizzleClient(platform.env.DB);

  // Shell HTML must stay fresh. Stale PWA/launcher documents are the
  // fastest route to "Something went wrong" because they can reference
  // chunks from an older deploy. Cache the immutable assets aggressively;
  // keep the document itself network-first.
  setHeaders({ 'cache-control': 'no-store' });

  // Filter pushed into the DB query so pagination is correct.
  let dbRows: FeaturedApp[];
  let dbCategories: string[];
  let overrides: CurationOverrides | undefined;
  try {
    [dbRows, dbCategories, overrides] = await Promise.all([
      query
        ? searchPublic(db, query, { limit: PER_PAGE + 1, offset, category: categoryFilter })
        : browsePublic(db, { limit: PER_PAGE + 1, offset, category: categoryFilter }),
      listCategories(db),
      // Live D1 visibility wins over the build-time curation manifest, so
      // admin visibility changes apply without waiting for a redeploy.
      curationOverrides(db, curatedApps.map((app) => app.slug)),
    ]);
  } catch {
    const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter);
    const visible = fallback.apps.slice(offset, offset + PER_PAGE);
    const featured = isDefaultBrowse ? orderedFeatured(visible, featuredSlugs) : [];
    return {
      apps: visible,
      featured,
      topFourSlugs: featured.slice(0, 4).map((app) => app.slug),
      suggestionPool: fallbackApps(phase).slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories: fallback.categories,
      kindFilter: null,
      categoryFilter,
      remixableFilter,
    };
  }

  const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter, overrides);
  const categories = [...new Set([...dbCategories, ...fallback.categories])].sort();
  const appRows =
    offset === 0
      ? mergeWithBundledApps(dbRows, query, categoryFilter, remixableFilter, phase, overrides)
      : launcherVisible(dbRows, phase, overrides);

  if (appRows.length === 0) {
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      featured: [],
      topFourSlugs: [] as string[],
      suggestionPool: fallbackApps(phase, overrides).slice(0, 12),
      query,
      page,
      hasMore: fallback.apps.length > offset + PER_PAGE,
      categories,
      kindFilter: null,
      categoryFilter,
      remixableFilter,
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
  const lineageRows = ids.length
    ? await db
        .select({
          appId: schema.appLineage.appId,
          sourceRepo: schema.appLineage.sourceRepo,
          license: schema.appLineage.license,
          remixAllowed: schema.appLineage.remixAllowed,
        })
        .from(schema.appLineage)
        .where(inArray(schema.appLineage.appId, ids))
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
  const lineageByApp = new Map(lineageRows.map((row) => [row.appId, row]));
  // Narrow the wide schema column types into the AppKind union the UI expects.
  const isAppKind = (v: string | null): v is AppKind =>
    v === 'local' || v === 'connected' || v === 'cloud';

  const decorated = visible
    .map((a) => {
      const lineage = lineageByApp.get(a.id ?? '');
      const firstPartySigned = isFirstPartyShowcase(a.slug);
      const remixable = firstPartySigned || Boolean(lineage?.remixAllowed && lineage.sourceRepo && lineage.license);
      return {
        ...a,
        badges: provenBadgesFromAwards(byApp.get(a.id ?? '') ?? []),
        kind: isAppKind(a.currentDetectedKind) ? a.currentDetectedKind : null,
        kindStatus: (a.currentPublicKindStatus ?? null) as PublicKindStatus | null,
        firstPartySigned,
        remixable,
      };
    })
    .filter((a) => !remixableFilter || a.remixable);

  const hasMore = appRows.length > PER_PAGE;

  // First-shelf curation: featured tools come first when the user hasn't
  // searched/filtered. `isDefaultBrowse` is already declared above for the
  // cache-control decision; reuse it. Filter is defensive — missing slugs
  // (e.g. retired showcases) silently drop out rather than crash.
  const featured = isDefaultBrowse
    ? orderedFeatured(decorated, featuredSlugs)
    : [];
  const topFourSlugs = featured.slice(0, 4).map((app) => app.slug);

  // Suggestion pool for the empty-search fallback. Always populated so
  // the client-side resolver has something to score against, even on
  // queries that hit zero rows from the DB filter.
  const suggestionPool = fallbackApps(phase, overrides).slice(0, 12);

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
    remixableFilter,
  };
};
