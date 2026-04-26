/**
 * Leaderboard queries — Drizzle over D1.
 *
 * Three shelves drive the public /leaderboards page:
 *   - Trending:  most install_prompt_accepted events in window
 *   - New:       apps created within window (newest first)
 *   - Top-rated: apps with >= minRatings, ordered by mean rating
 *
 * In the Postgres version `usage_daily.app_id` stored apps.slug. The D1
 * mirror retains the same convention (verified by reading the mirror
 * script). All queries return the same `LeaderboardEntry` shape so a
 * single card component renders all three shelves.
 *
 * `score` packs the per-shelf metric for sorting/display:
 *   - trending: install count
 *   - new:      created_at epoch ms
 *   - rated:    mean rating × 100 (so 4.7 → 470)
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { ShippieDb } from '../client';
import { apps, appRatings, usageDaily } from '../schema';

export interface LeaderboardEntry {
  slug: string;
  name: string | null;
  taglineOrDesc: string | null;
  icon: string | null;
  themeColor: string;
  score: number;
}

const PUBLIC_FILTERS = and(
  eq(apps.visibilityScope, 'public'),
  eq(apps.isArchived, false),
);

function windowStartIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD — usage_daily.day is a date string
}

export interface WindowOpts {
  days?: number;
  limit?: number;
}

export async function topByCategory(
  db: ShippieDb,
  opts: WindowOpts = {},
): Promise<LeaderboardEntry[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 12;
  const start = windowStartIso(days);

  const rows = await db.all<{
    slug: string;
    name: string | null;
    tagline: string | null;
    description: string | null;
    icon: string | null;
    theme_color: string;
    score: number | string;
  }>(sql`
    SELECT a.slug, a.name, a.tagline, a.description,
           a.icon_url AS icon, a.theme_color, COALESCE(SUM(u.count), 0) AS score
    FROM apps a
    JOIN usage_daily u
      ON u.app_id = a.slug
     AND u.event_type = 'install_prompt_accepted'
     AND u.day >= ${start}
    WHERE a.is_archived = 0
      AND a.visibility_scope = 'public'
      AND a.active_deploy_id IS NOT NULL
    GROUP BY a.slug, a.name, a.tagline, a.description, a.icon_url, a.theme_color
    HAVING COALESCE(SUM(u.count), 0) > 0
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    taglineOrDesc: r.tagline ?? r.description ?? null,
    icon: r.icon,
    themeColor: r.theme_color,
    score: Number(r.score),
  }));
}

export async function risingApps(
  db: ShippieDb,
  opts: WindowOpts = {},
): Promise<LeaderboardEntry[]> {
  const days = opts.days ?? 14;
  const limit = opts.limit ?? 12;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days);
  const startIso = start.toISOString();

  const rows = await db
    .select({
      slug: apps.slug,
      name: apps.name,
      tagline: apps.tagline,
      description: apps.description,
      icon: apps.iconUrl,
      themeColor: apps.themeColor,
      createdAt: apps.createdAt,
    })
    .from(apps)
    .where(and(PUBLIC_FILTERS, gte(apps.createdAt, startIso)))
    .orderBy(desc(apps.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    taglineOrDesc: r.tagline ?? r.description ?? null,
    icon: r.icon,
    themeColor: r.themeColor,
    score: Date.parse(r.createdAt),
  }));
}

export async function topRated(
  db: ShippieDb,
  opts: { minRatings?: number; limit?: number } = {},
): Promise<LeaderboardEntry[]> {
  const minRatings = opts.minRatings ?? 3;
  const limit = opts.limit ?? 12;

  // Aggregate first so we can join apps by id (the D1 mirror uses
  // appRatings.appId == apps.id; the Postgres legacy used slug, but the
  // mirror normalised on import).
  const aggRows = await db
    .select({
      appId: appRatings.appId,
      avg: sql<number>`AVG(${appRatings.rating})`.as('avg'),
      n: sql<number>`COUNT(*)`.as('n'),
    })
    .from(appRatings)
    .groupBy(appRatings.appId)
    .having(sql`COUNT(*) >= ${minRatings}`);

  if (aggRows.length === 0) return [];

  const ids = aggRows.map((r) => r.appId);
  const appRows = await db
    .select({
      id: apps.id,
      slug: apps.slug,
      name: apps.name,
      tagline: apps.tagline,
      description: apps.description,
      icon: apps.iconUrl,
      themeColor: apps.themeColor,
    })
    .from(apps)
    .where(and(PUBLIC_FILTERS, sql`${apps.id} IN ${ids}`));

  const byId = new Map(appRows.map((a) => [a.id, a]));
  const entries: LeaderboardEntry[] = [];
  for (const agg of aggRows) {
    const a = byId.get(agg.appId);
    if (!a) continue;
    entries.push({
      slug: a.slug,
      name: a.name,
      taglineOrDesc: a.tagline ?? a.description ?? null,
      icon: a.icon,
      themeColor: a.themeColor,
      score: Math.round(Number(agg.avg) * 100),
    });
  }
  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, limit);
}
