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

type LauncherPhase = 'prelaunch' | 'world-cup';

const WORLD_CUP_PHASE_START_MS = Date.UTC(2026, 5, 11);

/**
 * Featured shelf by launch phase. Pre-launch leads with the privacy story;
 * the World Cup window rotates the event app in without making the privacy
 * slate a permanent casualty.
 */
const LAUNCHER_FEATURED_SLUGS_BY_PHASE = {
  prelaunch: [
    'cycle',         // your cycle, never on a server
    'sleep',         // your sleep pattern, logged locally
    'tab',           // split a bill, no accounts
    'ledger',        // money that stays yours
    'chiwit',        // how does today feel?
    'voice-memo',    // thoughts you do not want anywhere else
    'palate',        // recipes that work offline at 6pm
    'journal',       // the log of everything that ran today
    'quiet',         // five-minute reset, no subscription
    'habit-tracker', // streaks fed by the tools you already use
  ],
  'world-cup': [
    'golazo',        // launch-week traffic hook
    'chiwit',        // daily pulse and retention habit
    'tab',           // no-account bill splitting demo
    'cycle',         // privacy anchor stays visible
    'sleep',         // local daily ritual
    'ledger',        // money that stays yours
    'voice-memo',    // private thoughts
    'palate',        // offline dinner utility
    'quiet',         // reset without a subscription
    'habit-tracker', // intent-fed streaks
  ],
} as const satisfies Record<LauncherPhase, readonly string[]>;

// WIP apps can exist in production DB before their hosted runtime is ready.
// Keep them out of launcher/mobile surfaces until explicitly shipped.
const PRELAUNCH_HIDDEN_SLUGS = new Set(['golazo']);

function launcherPhase(now: Date): LauncherPhase {
  return now.getTime() >= WORLD_CUP_PHASE_START_MS ? 'world-cup' : 'prelaunch';
}

function launcherVisible<T extends { slug: string }>(apps: T[], phase: LauncherPhase): T[] {
  if (phase === 'world-cup') return apps;
  return apps.filter((app) => !PRELAUNCH_HIDDEN_SLUGS.has(app.slug));
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

function fallbackApps(phase: LauncherPhase) {
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
  })), phase);
}

function filteredFallbackApps(
  query: string,
  categoryFilter: string | null,
  phase: LauncherPhase,
  remixableFilter = false,
) {
  const fallback = fallbackApps(phase);
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
) {
  const visibleRows = launcherVisible(rows, phase);
  const seen = new Set(visibleRows.map((app) => app.slug));
  const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter).apps.filter((app) => !seen.has(app.slug));
  return [...visibleRows, ...fallback];
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
  try {
    [dbRows, dbCategories] = await Promise.all([
      query
        ? searchPublic(db, query, { limit: PER_PAGE + 1, offset, category: categoryFilter })
        : browsePublic(db, { limit: PER_PAGE + 1, offset, category: categoryFilter }),
      listCategories(db),
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

  const fallback = filteredFallbackApps(query, categoryFilter, phase, remixableFilter);
  const categories = [...new Set([...dbCategories, ...fallback.categories])].sort();
  const appRows =
    offset === 0
      ? mergeWithBundledApps(dbRows, query, categoryFilter, remixableFilter, phase)
      : launcherVisible(dbRows, phase);

  if (appRows.length === 0) {
    return {
      apps: fallback.apps.slice(offset, offset + PER_PAGE),
      featured: [],
      topFourSlugs: [] as string[],
      suggestionPool: fallbackApps(phase).slice(0, 12),
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
  const suggestionPool = fallbackApps(phase).slice(0, 12);

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
