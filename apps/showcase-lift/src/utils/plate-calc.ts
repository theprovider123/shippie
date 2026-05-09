/**
 * Greedy plate-load solver.
 *
 * Given a target load (kg or lb), a bar weight, and an inventory of plate
 * weights, returns the set of plates to load on each side. The bar takes
 * the same plates symmetrically — we solve the per-side load and then
 * report the plate list once.
 *
 * If the target can't be hit exactly with the available plates, returns
 * the closest achievable load (always less than or equal to target).
 *
 * Plate inventory is per side, not per plate. e.g. inventory of [25, 20]
 * means "the gym has at least 1 of each plate weight; assume infinite for
 * the per-side calc." Real gym plate-pair limits aren't modeled here —
 * treat this as advisory.
 */

export interface PlateBreakdown {
  /** The actual load achieved (bar + 2× plates per side). */
  achievedLoad: number;
  /** Plates loaded on each side, largest first. */
  plates: number[];
  /** True if the target was achievable exactly. */
  exact: boolean;
}

export function solvePlates(input: {
  targetLoad: number;
  barWeight: number;
  /** Available plate weights — order doesn't matter, function sorts. */
  plates: readonly number[];
}): PlateBreakdown {
  const { targetLoad, barWeight } = input;
  const sortedPlates = [...input.plates].filter((p) => p > 0).sort((a, b) => b - a);

  if (targetLoad <= barWeight) {
    return { achievedLoad: barWeight, plates: [], exact: targetLoad === barWeight };
  }

  const perSideTarget = (targetLoad - barWeight) / 2;
  const result: number[] = [];
  let remaining = perSideTarget;

  for (const plate of sortedPlates) {
    while (remaining + 1e-9 >= plate) {
      result.push(plate);
      remaining -= plate;
    }
  }

  const achievedPerSide = result.reduce((sum, p) => sum + p, 0);
  const achievedLoad = barWeight + 2 * achievedPerSide;
  const exact = Math.abs(remaining) < 1e-6;
  return { achievedLoad, plates: result, exact };
}

/** Default plate inventory in kg. */
export const DEFAULT_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Default plate inventory in lb (Olympic bar plates). */
export const DEFAULT_PLATES_LB: readonly number[] = [45, 35, 25, 15, 10, 5, 2.5];

/** Default bar weight in kg (Olympic bar). */
export const DEFAULT_BAR_KG = 20;

/** Default bar weight in lb (Olympic bar). */
export const DEFAULT_BAR_LB = 45;
