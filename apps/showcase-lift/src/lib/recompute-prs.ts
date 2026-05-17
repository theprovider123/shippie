/**
 * Scrap-and-rebuild PR detection for one variant + lineage. Used after
 * an edit/delete invalidates the existing PR rows.
 *
 * Approach: delete every PR row touching the variant or its lineage,
 * then walk the variant's working sets in chronological order, treating
 * each as a candidate against the history-up-to-that-point.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  deletePrsForVariantOrLineage,
  insertPr,
  workingSetsForLineage,
  workingSetsForVariant,
} from '../db/queries.ts';
import { detectPrCandidates } from '../utils/pr-detect.ts';

export async function recomputePrsForExercise(
  db: ShippieLocalDb,
  variantId: string | null,
  lineageId: string | null,
): Promise<void> {
  if (!variantId && !lineageId) return;
  await deletePrsForVariantOrLineage(db, variantId, lineageId);

  const variantSets = variantId ? await workingSetsForVariant(db, variantId) : [];
  const lineageSets = lineageId ? await workingSetsForLineage(db, lineageId) : [];

  // Sort chronologically so each candidate is detected against its
  // predecessors only (the function filters by set.id, but ordering
  // affects which sets count as "previous best").
  const sorted = [...variantSets].sort(
    (a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
  );

  for (const candidate of sorted) {
    const variantHistory = sorted.filter((s) => s.id !== candidate.id);
    const lineageHistory = lineageSets.filter((s) => s.id !== candidate.id);
    const cands = detectPrCandidates({
      set: candidate,
      variantId,
      lineageId,
      variantHistory,
      lineageHistory,
    });
    for (const c of cands) {
      await insertPr(db, c.pr);
    }
  }
}
