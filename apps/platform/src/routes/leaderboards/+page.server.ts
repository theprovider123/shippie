/**
 * /leaderboards — aggregate public shelves.
 *
 * App-level aggregates only (no per-user, no game scoreboards). The
 * shelves come from the helpers in `$server/db/queries/leaderboards`,
 * which run against `usage_daily` + `apps` + `app_ratings`. All three
 * shelves filter on `visibility_scope = 'public'` and `is_archived = 0`
 * — unlisted/private/archived apps never appear here.
 *
 * Empty-result safety: if the DB binding is missing or queries return
 * nothing, we degrade to empty arrays and the page renders an
 * "(no apps yet)" empty-state per shelf rather than 500ing.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import {
  topByCategory,
  risingApps,
  topRated,
  type LeaderboardEntry,
} from '$server/db/queries/leaderboards';

export const load: PageServerLoad = async ({ platform }) => {
  const empty: { trending: LeaderboardEntry[]; rising: LeaderboardEntry[]; rated: LeaderboardEntry[] } = {
    trending: [],
    rising: [],
    rated: [],
  };

  if (!platform?.env.DB) return empty;

  const db = getDrizzleClient(platform.env.DB);

  // Three independent reads — fan out in parallel. Each guards itself so a
  // single shelf failing doesn't blank the whole page.
  const [trending, rising, rated] = await Promise.all([
    topByCategory(db, { days: 7, limit: 12 }).catch((err) => {
      console.warn('[leaderboards] trending query failed', err);
      return [] as LeaderboardEntry[];
    }),
    risingApps(db, { days: 14, limit: 12 }).catch((err) => {
      console.warn('[leaderboards] rising query failed', err);
      return [] as LeaderboardEntry[];
    }),
    topRated(db, { minRatings: 3, limit: 12 }).catch((err) => {
      console.warn('[leaderboards] rated query failed', err);
      return [] as LeaderboardEntry[];
    }),
  ]);

  return { trending, rising, rated };
};
