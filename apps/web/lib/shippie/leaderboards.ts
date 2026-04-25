// apps/web/lib/shippie/leaderboards.ts
/**
 * Marketplace leaderboard query helpers.
 *
 * Three shelves power the public /leaderboards page:
 *
 *   - Trending:   most `install_prompt_accepted` events in last N days
 *   - New:        apps created within last N days (newest first)
 *   - Top-rated:  apps with ≥ minRatings whose average rating is highest
 *
 * All helpers return the same `LeaderboardEntry` shape so the page can
 * render them through one card component. The `score` column is packed
 * so each shelf can sort+display without a second schema.
 *
 * Visibility: skips archived apps and apps whose `visibility_scope` is
 * anything other than `public`. Also requires an `active_deploy_id` so
 * leaderboard tiles always land on a working install page.
 *
 * Slug is the foreign key on the rollup + rating side (both store text
 * app_id that matches apps.slug). Joins are therefore on apps.slug, not
 * apps.id.
 */
import { sql } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

export interface LeaderboardEntry {
  slug: string;
  name: string | null;
  taglineOrDesc: string | null;
  icon: string | null;
  score: number;
}

interface TrendingOpts {
  days?: number;
  limit?: number;
}

interface NewOpts {
  days?: number;
  limit?: number;
}

interface TopRatedOpts {
  minRatings?: number;
  limit?: number;
}

function windowStart(days: number): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

/**
 * postgres-js serializes a raw JS Date via `toString()` — which produces
 * the system-local string and breaks Postgres timestamp parsing. Pass
 * ISO 8601 strings into drizzle `sql` templates instead. PGlite accepts
 * either form.
 */
function windowStartIso(days: number): string {
  return windowStart(days).toISOString();
}

/**
 * postgres-js returns an array directly from `.execute(sql...)`; PGlite
 * wraps it in `{ rows: [...] }`. Both paths are valid in this codebase.
 */
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown } | null | undefined;
  if (maybe && Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

export async function queryTrending(
  db: ShippieDb,
  opts: TrendingOpts = {},
): Promise<LeaderboardEntry[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 12;
  const start = windowStartIso(days);

  // Sum accepted-install counts per app in window, join apps by slug,
  // filter to visible apps, order by total desc.
  const res = await db.execute(sql`
    select
      a.slug      as slug,
      a.name      as name,
      a.tagline   as tagline,
      a.description as description,
      a.icon_url  as icon,
      coalesce(sum(u.count), 0)::bigint as score
    from ${schema.apps} a
    join ${schema.usageDaily} u
      on u.app_id = a.slug
     and u.event_type = 'install_prompt_accepted'
     and u.day >= ${start}
    where a.is_archived = false
      and a.visibility_scope = 'public'
      and a.active_deploy_id is not null
    group by a.slug, a.name, a.tagline, a.description, a.icon_url
    having coalesce(sum(u.count), 0) > 0
    order by score desc
    limit ${limit}
  `);
  return rowsOf<{
    slug: string;
    name: string | null;
    tagline: string | null;
    description: string | null;
    icon: string | null;
    score: number | string | bigint;
  }>(res).map((r) => ({
    slug: r.slug,
    name: r.name,
    taglineOrDesc: r.tagline ?? r.description ?? null,
    icon: r.icon,
    score: Number(r.score),
  }));
}

export async function queryNew(
  db: ShippieDb,
  opts: NewOpts = {},
): Promise<LeaderboardEntry[]> {
  const days = opts.days ?? 14;
  const limit = opts.limit ?? 12;
  const start = windowStartIso(days);

  const res = await db.execute(sql`
    select
      a.slug,
      a.name,
      a.tagline,
      a.description,
      a.icon_url as icon,
      a.created_at as created_at
    from ${schema.apps} a
    where a.is_archived = false
      and a.visibility_scope = 'public'
      and a.active_deploy_id is not null
      and a.created_at >= ${start}
    order by a.created_at desc
    limit ${limit}
  `);
  return rowsOf<{
    slug: string;
    name: string | null;
    tagline: string | null;
    description: string | null;
    icon: string | null;
    created_at: Date | string;
  }>(res).map((r) => {
    const ts = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
    return {
      slug: r.slug,
      name: r.name,
      taglineOrDesc: r.tagline ?? r.description ?? null,
      icon: r.icon,
      score: ts.getTime(),
    };
  });
}

export async function queryTopRated(
  db: ShippieDb,
  opts: TopRatedOpts = {},
): Promise<LeaderboardEntry[]> {
  const minRatings = opts.minRatings ?? 3;
  const limit = opts.limit ?? 12;

  // Aggregate ratings per app_id (= slug), require n >= minRatings,
  // join apps + visibility filter, order by avg desc then count desc.
  const res = await db.execute(sql`
    with agg as (
      select
        app_id,
        avg(rating)::float as avg_rating,
        count(*)::int      as n
      from ${schema.appRatings}
      group by app_id
      having count(*) >= ${minRatings}
    )
    select
      a.slug,
      a.name,
      a.tagline,
      a.description,
      a.icon_url as icon,
      agg.avg_rating as avg_rating,
      agg.n          as n
    from agg
    join ${schema.apps} a on a.slug = agg.app_id
    where a.is_archived = false
      and a.visibility_scope = 'public'
      and a.active_deploy_id is not null
    order by agg.avg_rating desc, agg.n desc
    limit ${limit}
  `);
  return rowsOf<{
    slug: string;
    name: string | null;
    tagline: string | null;
    description: string | null;
    icon: string | null;
    avg_rating: number | string;
    n: number | string;
  }>(res).map((r) => ({
    slug: r.slug,
    name: r.name,
    taglineOrDesc: r.tagline ?? r.description ?? null,
    icon: r.icon,
    score: Math.round(Number(r.avg_rating) * 100),
  }));
}
