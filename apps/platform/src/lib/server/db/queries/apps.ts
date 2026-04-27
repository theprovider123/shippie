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
import { and, desc, eq, sql, inArray } from 'drizzle-orm';
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

export async function findFeatured(db: ShippieDb, limit = 6): Promise<FeaturedApp[]> {
  const rows = await db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(PUBLIC_FILTERS)
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
  if (!ftsQuery) return browsePublic(db, opts);

  // Two-step: FTS5 returns rowid_id (= apps.id), then we fetch the cards.
  // Note: limit/offset apply to the FTS step. If a kind filter is active
  // we cannot cleanly paginate across the join — apply kind in the join
  // and let the caller request a larger page if filtered counts are low.
  const matchRows = await db.all<{ rowid_id: string }>(sql`
    SELECT rowid_id FROM apps_fts WHERE apps_fts MATCH ${ftsQuery}
    ORDER BY rank LIMIT ${limit} OFFSET ${offset}
  `);
  const ids = matchRows.map((r) => r.rowid_id);
  if (ids.length === 0) return [];

  const where = kind
    ? and(inArray(apps.id, ids), PUBLIC_FILTERS, eq(apps.currentDetectedKind, kind))
    : and(inArray(apps.id, ids), PUBLIC_FILTERS);

  const rows = await db.select(FEATURED_COLUMNS).from(apps).where(where);

  // Preserve FTS rank ordering.
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function browsePublic(
  db: ShippieDb,
  opts: SearchOptions = {},
): Promise<FeaturedApp[]> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  const kind = opts.kind ?? null;
  const where = kind
    ? and(PUBLIC_FILTERS, eq(apps.currentDetectedKind, kind))
    : PUBLIC_FILTERS;
  return db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(where)
    .orderBy(desc(apps.upvoteCount), desc(apps.installCount), desc(apps.lastDeployedAt))
    .limit(limit)
    .offset(offset);
}

export async function findByCategory(
  db: ShippieDb,
  category: string,
  limit = 12,
): Promise<FeaturedApp[]> {
  return db
    .select(FEATURED_COLUMNS)
    .from(apps)
    .where(and(eq(apps.category, category), PUBLIC_FILTERS))
    .orderBy(desc(apps.upvoteCount), desc(apps.installCount))
    .limit(limit);
}

export async function listCategories(db: ShippieDb): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: apps.category })
    .from(apps)
    .where(PUBLIC_FILTERS);
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}
