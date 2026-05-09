/**
 * Personal-record detection. Three flavours so a "machine chest press
 * PR" never accidentally pretends to be a barbell bench PR:
 *
 *   - Variant PR: best for one specific variant_id (e.g. barbell bench)
 *   - Lineage PR: best across all variants of a lift (e.g. any bench)
 *   - Rep-range PR: best for one variant within a rep-range bucket
 *
 * The "is this a PR?" question depends on the rep-range. Beating 100kg
 * × 5 with 102.5kg × 3 isn't an unambiguous improvement — different
 * intensity / rep range. So we bucket reps into 1-3 / 4-6 / 7-10 /
 * 11-15 / 16+ and only compare within a bucket. Consumers who want a
 * single "max weight" view can compute it from the bucket bests.
 *
 * Phase 2 deliverable: detectPrCandidates() takes a candidate set + the
 * full set/step history, returns 0-3 PR rows to insert. Pure function;
 * caller persists.
 */
import type { Pr, PrKind, RepRange, SetRow, WorkoutStep } from '../db/schema.ts';
import { newId } from './ids.ts';

export const REP_RANGES: readonly RepRange[] = ['1-3', '4-6', '7-10', '11-15', '16+'];

export function repRange(reps: number): RepRange {
  if (reps <= 3) return '1-3';
  if (reps <= 6) return '4-6';
  if (reps <= 10) return '7-10';
  if (reps <= 15) return '11-15';
  return '16+';
}

export interface PrCandidateInput {
  /** The set just logged. */
  set: SetRow;
  /** The exercise's variant + lineage. Either may be null if unset. */
  variantId: string | null;
  lineageId: string | null;
  /** All historical sets for this exercise's variant. */
  variantHistory: readonly SetRow[];
  /** All historical sets for this lineage (same lift, any variant). */
  lineageHistory: readonly SetRow[];
}

export interface PrCandidate {
  pr: Pr;
  /** The previous best this PR replaces, if any (for the burst copy). */
  previousBest: { weight: number; reps: number } | null;
}

export function detectPrCandidates(input: PrCandidateInput): PrCandidate[] {
  const out: PrCandidate[] = [];
  // Only working sets count. Warm-ups + failure reps + drop sets don't
  // claim PRs.
  if (input.set.set_type !== 'working') return out;
  if (input.set.reps <= 0 || input.set.weight <= 0) return out;

  const range = repRange(input.set.reps);

  // Variant PR (best at any rep count for this variant)
  if (input.variantId) {
    const previousBest = bestVariantSet(input.variantHistory, input.set);
    if (!previousBest || beats(input.set, previousBest)) {
      out.push({
        pr: makePr({
          kind: 'variant',
          variantId: input.variantId,
          lineageId: null,
          rep_range: null,
          set: input.set,
        }),
        previousBest: previousBest ? { weight: previousBest.weight, reps: previousBest.reps } : null,
      });
    }
  }

  // Lineage PR (best at any rep count, any variant of this lineage)
  if (input.lineageId) {
    const previousBest = bestVariantSet(input.lineageHistory, input.set);
    if (!previousBest || beats(input.set, previousBest)) {
      out.push({
        pr: makePr({
          kind: 'lineage',
          variantId: null,
          lineageId: input.lineageId,
          rep_range: null,
          set: input.set,
        }),
        previousBest: previousBest ? { weight: previousBest.weight, reps: previousBest.reps } : null,
      });
    }
  }

  // Rep-range PR (variant-scoped, within the rep bucket)
  if (input.variantId) {
    const inRange = input.variantHistory.filter(
      (s) => s.id !== input.set.id && s.set_type === 'working' && repRange(s.reps) === range,
    );
    const previousBest = inRange.reduce<SetRow | null>((acc, s) => {
      if (!acc) return s;
      if (s.weight > acc.weight) return s;
      if (s.weight === acc.weight && s.reps > acc.reps) return s;
      return acc;
    }, null);
    if (!previousBest || beats(input.set, previousBest)) {
      out.push({
        pr: makePr({
          kind: 'rep-range',
          variantId: input.variantId,
          lineageId: null,
          rep_range: range,
          set: input.set,
        }),
        previousBest: previousBest ? { weight: previousBest.weight, reps: previousBest.reps } : null,
      });
    }
  }

  return out;
}

/**
 * "Beats" semantics: more weight wins. Same weight + more reps wins.
 * Same weight + same reps does NOT count as a PR (no progress).
 */
export function beats(candidate: SetRow, previous: SetRow): boolean {
  if (candidate.weight > previous.weight) return true;
  if (candidate.weight === previous.weight && candidate.reps > previous.reps) return true;
  return false;
}

/** Best historical working set, weight-then-reps lex order, excluding the candidate itself. */
function bestVariantSet(history: readonly SetRow[], exclude: SetRow): SetRow | null {
  return history.reduce<SetRow | null>((acc, s) => {
    if (s.id === exclude.id) return acc;
    if (s.set_type !== 'working') return acc;
    if (s.weight <= 0 || s.reps <= 0) return acc;
    if (!acc) return s;
    if (s.weight > acc.weight) return s;
    if (s.weight === acc.weight && s.reps > acc.reps) return s;
    return acc;
  }, null);
}

interface MakePrInput {
  kind: PrKind;
  variantId: string | null;
  lineageId: string | null;
  rep_range: RepRange | null;
  set: SetRow;
}

function makePr(input: MakePrInput): Pr {
  return {
    id: newId('pr'),
    kind: input.kind,
    variant_id: input.variantId,
    lineage_id: input.lineageId,
    rep_range: input.rep_range,
    weight: input.set.weight,
    reps: input.set.reps,
    set_id: input.set.id,
    achieved_at: input.set.completed_at,
  };
}

/**
 * Helper: pull all sets that belong to a given variant by walking through
 * steps. Caller passes the steps + sets indexed however they like. Pure
 * function so it's testable and reusable.
 */
export function setsForVariant(
  allSteps: readonly WorkoutStep[],
  allSets: readonly SetRow[],
  variantId: string,
): SetRow[] {
  const stepIds = new Set(
    allSteps.filter((s) => s.variant_id === variantId).map((s) => s.id),
  );
  return allSets.filter((s) => stepIds.has(s.step_id));
}

export function setsForLineage(
  allSteps: readonly WorkoutStep[],
  allSets: readonly SetRow[],
  variantIdsInLineage: readonly string[],
): SetRow[] {
  const idSet = new Set(variantIdsInLineage);
  const stepIds = new Set(
    allSteps
      .filter((s): s is WorkoutStep & { variant_id: string } =>
        typeof s.variant_id === 'string' && idSet.has(s.variant_id),
      )
      .map((s) => s.id),
  );
  return allSets.filter((s) => stepIds.has(s.step_id));
}
