/**
 * Apps queries — Drizzle over the D1 binding.
 *
 * Used by:
 *   - Homepage featured grid (top 6 by upvote count)
 *   - /apps marketplace browse + search
 *   - /apps/[slug] detail page
 *
 * All queries filter to public + non-archived apps unless the call site
 * explicitly opts out. Private-app gating happens in the route handler
 * (it needs the request cookies for invite-grant verification) — keep
 * this module pure read-only over the D1 binding.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CurationOverride } from '$lib/launcher';
import type { ShippieDb } from '../client';
import { apps, appPermissions, deploys } from '../schema';
import type { App } from '../schema/apps';

export type FeaturedApp = Pick<
  App,
  | 'id'
  | 'slug'
  | 'name'
  | 'tagline'
  | 'description'
  | 'type'
  | 'category'
  | 'iconUrl'
  | 'themeColor'
  | 'upvoteCount'
  | 'installCount'
  | 'compatibilityScore'
  | 'currentDetectedKind'
  | 'currentPublicKindStatus'
>;

const PUBLIC_FILTERS = and(
  eq(apps.visibilityScope, 'public'),
  eq(apps.isArchived, false),
);

const OVERRIDE_SURFACES = new Set(['featured', 'arcade', 'labs', 'archived']);

/**
 * Live curation state for the given slugs, used to overlay the
 * build-time `FIRST_PARTY_CURATION` manifest at request time. The admin
 * panel writes `visibility_scope` / `surface` to D1; without this
 * overlay those changes never reach launcher surfaces until the next
 * deploy bakes a fresh manifest. Archived rows read as private so they
 * disappear from listings regardless of their stored scope.
 */
export async function curationOverrides(
  db: ShippieDb,
  slugs: readonly string[],
): Promise<Map<string, CurationOverride>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({
      slug: apps.slug,
      visibilityScope: apps.visibilityScope,
      surface: apps.surface,
      isArchived: apps.isArchived,
    })
    .from(apps)
    .where(inArray(apps.slug, [...slugs]));
  return new Map(
    rows.map((row) => [
      row.slug,
      {
        visibility: row.isArchived ? 'private' : row.visibilityScope,
        surface: (OVERRIDE_SURFACES.has(row.surface) ? row.surface : 'featured') as CurationOverride['surface'],
      },
    ]),
  );
}

/**
 * Marketplace surface filter. Pass through to public listing queries so
 * `/arcade` shows only `surface='arcade'`, `/labs` shows only
 * `surface='labs'`. The marketplace home (`/apps`) shows
 * featured + arcade together so "games" can sit alongside "tools" /
 * "social" as a normal category chip — pass an array there.
 *
 * Default: `['featured', 'arcade']` for callers that don't pass a
 * value (so the home grid shows both, and the chip rail derives a
 * `games` chip naturally from arcade entries' `category`).
 */
export type SurfaceFilter = 'featured' | 'arcade' | 'labs' | 'archived';
export type SurfaceSelector = SurfaceFilter | readonly SurfaceFilter[];

function surfaceCondition(selector: SurfaceSelector | undefined) {
  if (!selector) return inArray(apps.surface, ['featured', 'arcade']);
  if (Array.isArray(selector)) return inArray(apps.surface, [...selector]);
  return eq(apps.surface, selector as SurfaceFilter);
}

const FEATURED_COLUMNS = {
  id: apps.id,
  slug: apps.slug,
  name: apps.name,
  tagline: apps.tagline,
  description: apps.description,
  type: apps.type,
  category: apps.category,
  iconUrl: apps.iconUrl,
  themeColor: apps.themeColor,
  upvoteCount: apps.upvoteCount,
  installCount: apps.installCount,
  compatibilityScore: apps.compatibilityScore,
  currentDetectedKind: apps.currentDetectedKind,
  currentPublicKindStatus: apps.currentPublicKindStatus,
};

export async function findFeatured(
  db: ShippieDb,
  limit = 6,
  surface?: SurfaceSelector,
): Promise<FeaturedApp[]> {
  const rows = await db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(and(PUBLIC_FILTERS, surfaceCondition(surface)))
    .orderBy(desc(apps.upvoteCount), desc(apps.installCount))
    .limit(limit);
  return rows;
}

export async function findBySlug(db: ShippieDb, slug: string) {
  const row = await db.query.apps.findFirst({ where: eq(apps.slug, slug) });
  return row ?? null;
}

export async function findPermissionsForApp(db: ShippieDb, appId: string) {
  const row = await db.query.appPermissions.findFirst({
    where: eq(appPermissions.appId, appId),
  });
  return row ?? null;
}

export async function findLatestDeploy(db: ShippieDb, appId: string) {
  const rows = await db
    .select()
    .from(deploys)
    .where(eq(deploys.appId, appId))
    .orderBy(desc(deploys.version))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Sanitize a free-text search query for FTS5's MATCH operator.
 *
 * SQLite's FTS5 query syntax treats `"`, `*`, `(`, `)`, `:`, `^`, `-`,
 * `+`, `AND`, `OR`, `NOT`, and `NEAR` as operators. Naively concatenating
 * a user string into a `MATCH` predicate is an injection vector — a
 * search for `apps with " in name` will throw a parse error and 500 the
 * page; a search for `* OR ""` could leak rows.
 *
 * The safe transformation: split on whitespace, drop tokens with
 * non-word characters or operator keywords, then double-quote each
 * remaining token (FTS5's literal-string escape). The result is a
 * conjunction of token literals.
 */
const FTS_RESERVED = new Set(['AND', 'OR', 'NOT', 'NEAR']);

export function buildFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter((t) => t.length >= 2 && !FTS_RESERVED.has(t.toUpperCase()))
    .slice(0, 8);
  if (tokens.length === 0) return null;
  // Wrap each token in quotes + add prefix-match (`*`) so partial matches
  // hit. The FTS5 spec accepts `"foo"*` as a prefix-quoted literal.
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export type KindFilter = 'local' | 'connected' | 'cloud';

export interface SearchOptions {
  limit?: number;
  offset?: number;
  kind?: KindFilter | null;
  category?: string | null;
  /**
   * Marketplace surface filter. Default: `['featured', 'arcade']` so the
   * home grid shows games alongside tools as a regular category. `/arcade`
   * passes `'arcade'`; `/labs` passes `'labs'`. Pass an explicit single
   * surface for the focused routes.
   */
  surface?: SurfaceSelector;
}

export async function searchPublic(
  db: ShippieDb,
  query: string,
  opts: SearchOptions = {},
): Promise<FeaturedApp[]> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  const kind = opts.kind ?? null;
  const ftsQuery = buildFtsQuery(query);
  // Default to featured + arcade so search hits games as well as tools.
  const surfaces: SurfaceFilter[] = !opts.surface
    ? ['featured', 'arcade']
    : Array.isArray(opts.surface)
      ? [...opts.surface]
      : [opts.surface as SurfaceFilter];
  if (!ftsQuery) return browsePublic(db, opts);

  // Join FTS results to apps before LIMIT/OFFSET so kind/category filters
  // paginate the filtered result set instead of "first page of any app,
  // then filter in memory". This is load-bearing for /apps?kind=local&q=...
  // where matching Local apps may rank behind Connected/Cloud results.
  // sql.raw is safe here because `surfaces` is a closed enum.
  const surfaceList = surfaces.map((s) => `'${s}'`).join(',');
  return db.all<FeaturedApp>(sql`
    SELECT
      a.id AS id,
      a.slug AS slug,
      a.name AS name,
      a.tagline AS tagline,
      a.description AS description,
      a.type AS type,
      a.category AS category,
      a.icon_url AS iconUrl,
      a.theme_color AS themeColor,
      a.upvote_count AS upvoteCount,
      a.install_count AS installCount,
      a.compatibility_score AS compatibilityScore,
      a.current_detected_kind AS currentDetectedKind,
      a.current_public_kind_status AS currentPublicKindStatus
    FROM apps_fts
    JOIN apps a ON apps_fts.rowid_id = a.id
    WHERE apps_fts MATCH ${ftsQuery}
      AND a.visibility_scope = 'public'
      AND a.is_archived = 0
      AND a.surface IN (${sql.raw(surfaceList)})
      ${kind ? sql`AND a.current_detected_kind = ${kind}` : sql``}
      ${opts.category ? sql`AND a.category = ${opts.category}` : sql``}
    ORDER BY rank
    LIMIT ${limit} OFFSET ${offset}
  `);
}

export async function browsePublic(
  db: ShippieDb,
  opts: SearchOptions = {},
): Promise<FeaturedApp[]> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  const kind = opts.kind ?? null;
  const conds = [PUBLIC_FILTERS, surfaceCondition(opts.surface)];
  if (kind) conds.push(eq(apps.currentDetectedKind, kind));
  if (opts.category) conds.push(eq(apps.category, opts.category));
  return db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(and(...conds))
    .orderBy(desc(apps.upvoteCount), desc(apps.installCount), desc(apps.lastDeployedAt))
    .limit(limit)
    .offset(offset);
}

export async function findByCategory(
  db: ShippieDb,
  category: string,
  limit = 12,
  surface?: SurfaceSelector,
): Promise<FeaturedApp[]> {
  return db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(and(eq(apps.category, category), PUBLIC_FILTERS, surfaceCondition(surface)))
    .orderBy(desc(apps.upvoteCount), desc(apps.installCount))
    .limit(limit);
}

export async function listCategories(
  db: ShippieDb,
  surface?: SurfaceSelector,
): Promise<string[]> {
  // Default selector is featured + arcade so the chip rail derives a
  // `games` chip from arcade entries' `category`. /arcade and /labs
  // pass their explicit single surface.
  const rows = await db
    .selectDistinct({ category: apps.category })
    .from(apps)
    .where(and(PUBLIC_FILTERS, surfaceCondition(surface)));
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}
