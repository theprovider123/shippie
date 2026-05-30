/**
 * Estimated one-rep max.
 *
 * Two industry-standard formulae, blended. Neither is "true" — a 1RM is
 * a real attempt — so Lift treats e1RM as a *trend line*, not a number to
 * brag about. We blend Epley and Brzycki because they diverge at the
 * extremes and the average is steadier than either alone.
 *
 *   Epley:   w · (1 + reps/30)
 *   Brzycki: w · 36 / (37 − reps)
 *
 * Both assume sub-maximal sets of roughly ≤ 12 reps. Past that, the
 * estimate gets noisy, so callers can check `reliable`.
 */

export interface OneRepMax {
  /** Blended estimate (Epley + Brzycki) / 2. */
  estimate: number;
  epley: number;
  brzycki: number;
  /** False once reps climb past the range the formulae model well. */
  reliable: boolean;
}

const MAX_RELIABLE_REPS = 12;

export function estimateOneRepMax(weight: number, reps: number): OneRepMax {
  if (reps <= 0 || weight <= 0) {
    return { estimate: 0, epley: 0, brzycki: 0, reliable: false };
  }
  if (reps === 1) {
    return { estimate: weight, epley: weight, brzycki: weight, reliable: true };
  }
  const epley = weight * (1 + reps / 30);
  // Brzycki's denominator blows up as reps → 37; clamp defensively.
  const denom = Math.max(1, 37 - reps);
  const brzycki = (weight * 36) / denom;
  const estimate = (epley + brzycki) / 2;
  return {
    estimate: round(estimate),
    epley: round(epley),
    brzycki: round(brzycki),
    reliable: reps <= MAX_RELIABLE_REPS,
  };
}

/** Best estimated 1RM across a set of (weight, reps) efforts. */
export function bestEstimatedOneRepMax(
  sets: readonly { weight: number; reps: number }[],
): number {
  let best = 0;
  for (const s of sets) {
    const e = estimateOneRepMax(s.weight, s.reps).estimate;
    if (e > best) best = e;
  }
  return best;
}

/**
 * Working weight to hit a target rep count at a given e1RM — the inverse
 * of Epley. Used by the progression engine to translate a %-of-1RM
 * prescription into a barbell number.
 */
export function loadForReps(oneRepMax: number, reps: number): number {
  if (oneRepMax <= 0 || reps <= 0) return 0;
  if (reps === 1) return round(oneRepMax);
  return round(oneRepMax / (1 + reps / 30));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
