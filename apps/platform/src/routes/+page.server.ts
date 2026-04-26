/**
 * Homepage server load — fetches the featured-apps grid (top 6 by upvote
 * count) from D1. The bindings smoke-probe lived here in Phase 1; it
 * moved to `/__shippie/health` once Phase 4a put a real homepage on the
 * canary URL.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { findFeatured } from '$server/db/queries/apps';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env.DB) {
    return { featured: [], status: 'no-platform' as const };
  }
  try {
    const db = getDrizzleClient(platform.env.DB);
    const featured = await findFeatured(db, 6);
    return { featured, status: 'ok' as const };
  } catch (err) {
    // Don't 500 the homepage on a stray query error — show an empty grid
    // and surface the failure mode to /__shippie/health for ops.
    console.error('homepage:findFeatured failed', err);
    return { featured: [], status: 'error' as const };
  }
};
