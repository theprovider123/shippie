/**
 * Homepage server load — fetches the featured-apps grid (top 6 by upvote
 * count) from D1, plus the proven Capability Proof Badges per app so
 * the grid surfaces runtime evidence at the marketplace level. The
 * bindings smoke-probe lived here in Phase 1; it moved to
 * `/__shippie/health` once Phase 4a put a real homepage on the canary
 * URL.
 */
import type { PageServerLoad } from './$types';
import { inArray } from 'drizzle-orm';
import { getDrizzleClient, schema } from '$server/db/client';
import { findFeatured } from '$server/db/queries/apps';
import { provenBadgesFromAwards } from '$server/marketplace/capability-badges';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env.DB) {
    return { featured: [], status: 'no-platform' as const };
  }
  try {
    const db = getDrizzleClient(platform.env.DB);
    const featured = await findFeatured(db, 6);
    if (featured.length === 0) {
      return { featured, status: 'ok' as const };
    }

    const ids = featured.map((a) => a.id).filter((id): id is string => typeof id === 'string');
    const awarded = ids.length
      ? await db
          .select({
            appId: schema.capabilityBadges.appId,
            badge: schema.capabilityBadges.badge,
          })
          .from(schema.capabilityBadges)
          .where(inArray(schema.capabilityBadges.appId, ids))
      : [];

    // Group badges by appId so each card can render its own proven set.
    const byApp = new Map<string, { badge: string }[]>();
    for (const row of awarded) {
      let bucket = byApp.get(row.appId);
      if (!bucket) {
        bucket = [];
        byApp.set(row.appId, bucket);
      }
      bucket.push({ badge: row.badge });
    }

    const decorated = featured.map((app) => ({
      ...app,
      badges: provenBadgesFromAwards(byApp.get(app.id ?? '') ?? []),
    }));

    return { featured: decorated, status: 'ok' as const };
  } catch (err) {
    // Don't 500 the homepage on a stray query error — show an empty grid
    // and surface the failure mode to /__shippie/health for ops.
    console.error('homepage:findFeatured failed', err);
    return { featured: [], status: 'error' as const };
  }
};
