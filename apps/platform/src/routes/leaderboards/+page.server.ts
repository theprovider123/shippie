/**
 * Leaderboards — three shelves driven from `usage_daily` rollups + the
 * apps catalogue + ratings.
 *
 * Phase 4a runs the queries even when the rollup table is empty; the
 * components show the empty-state copy in that case.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { topByCategory, risingApps, topRated } from '$server/db/queries/leaderboards';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env.DB) {
    return { trending: [], rising: [], rated: [] };
  }
  const db = getDrizzleClient(platform.env.DB);
  const [trending, rising, rated] = await Promise.all([
    topByCategory(db, { days: 7, limit: 12 }),
    risingApps(db, { days: 14, limit: 12 }),
    topRated(db, { minRatings: 3, limit: 12 }),
  ]);
  return { trending, rising, rated };
};
