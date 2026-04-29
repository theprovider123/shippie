/**
 * /trust-preview — hidden internal page.
 *
 * Phase B3 surface. Shows the per-scanner false-positive rate and Stage B
 * promotion gate result. Admin-only, no public link, no nav entry. The
 * route exists so we can iterate on the maker-facing trust UX while the
 * Stage B harness collects dispositions in the background.
 *
 * When a scanner reaches `promotionReady === true` consistently, this
 * route's content gets promoted into the public app surface (per the
 * approved plan, Phase B3).
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { requireAdmin } from '$server/admin/auth';
import { deployScanOutcomes } from '$server/db/schema';
import {
  aggregateFalsePositiveRate,
  promotionReady,
  type PromotionDecision,
  type ScannerFalsePositiveStat,
} from '$server/db/queries/scan-outcomes';

export interface TrustPreviewRow {
  stat: ScannerFalsePositiveStat;
  decision: PromotionDecision;
}

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const platform = event.platform;
  if (!platform?.env?.DB) {
    return { rows: [] as TrustPreviewRow[] };
  }
  const db = getDrizzleClient(platform.env.DB);
  const outcomes = await db
    .select({
      scanner: deployScanOutcomes.scanner,
      disposition: deployScanOutcomes.disposition,
    })
    .from(deployScanOutcomes);
  const stats = aggregateFalsePositiveRate(outcomes);
  const rows: TrustPreviewRow[] = stats.map((stat) => ({
    stat,
    decision: promotionReady(stat),
  }));
  return { rows };
};
