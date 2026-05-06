/**
 * The Stall — when smoking large cuts (brisket, pork shoulder), evaporative
 * cooling at the meat surface stalls internal-temperature climb between
 * roughly 65°C and 75°C. The pitmaster's choice: WRAP (butcher paper or
 * foil) to push through, or RIDE it out for thicker bark.
 *
 * This module classifies a current state into one of three stages, used
 * by the smoking timer to surface real prompts as the cook progresses.
 */

export type StallStage =
  | { stage: 'pre-stall'; until_c: number; advice: string }
  | { stage: 'stall'; range: [number, number]; advice: string; choice: 'wrap' | 'ride' | 'either' }
  | { stage: 'post-stall'; advice: string };

/** Internal-temp range where the stall typically holds. */
export const STALL_RANGE_C: [number, number] = [65, 77];

/**
 * Classify where the cook sits relative to the stall.
 *
 * @param internal_c Current probe-temp inside the meat.
 * @param hours_at_temp Optional — how long internal-temp has been in the
 *   stall band. After ~2h the wrap-vs-ride decision becomes urgent.
 */
export function classifyStall(
  internal_c: number,
  hours_at_temp = 0,
): StallStage {
  const [lo, hi] = STALL_RANGE_C;
  if (internal_c < lo) {
    return {
      stage: 'pre-stall',
      until_c: lo,
      advice: `Climbing. Watch for the stall around ${lo}°C — surface evaporation will pin you there for hours unless you wrap.`,
    };
  }
  if (internal_c > hi) {
    return {
      stage: 'post-stall',
      advice: 'Through the stall. Now it climbs fast — start probing for tender; do not pull on temp alone.',
    };
  }
  // In the stall band.
  let choice: 'wrap' | 'ride' | 'either' = 'either';
  let advice: string;
  if (hours_at_temp >= 2) {
    choice = 'wrap';
    advice = `${hours_at_temp.toFixed(1)}h in the stall. Wrap in butcher paper now — internal will climb again within 30 min. Bark is set.`;
  } else if (hours_at_temp >= 1) {
    choice = 'either';
    advice = 'Mid-stall. Bark is forming. Wrap now for tender + faster, ride for thicker bark + 1–2h longer.';
  } else {
    choice = 'ride';
    advice = 'Stall is starting. Bark is still soft — ride for at least another hour before deciding to wrap.';
  }
  return { stage: 'stall', range: STALL_RANGE_C, advice, choice };
}

/**
 * Estimate hours-of-stall remaining if you ride. Empirical: each hour
 * in the stall climbs ~3°C; pushing from 70 → 77 is roughly 2.5h.
 *
 * @returns null if not in the stall, else estimated remaining hours.
 */
export function estimateStallHoursRemaining(internal_c: number): number | null {
  const [lo, hi] = STALL_RANGE_C;
  if (internal_c < lo || internal_c > hi) return null;
  const remaining_c = hi - internal_c;
  // ~3°C per hour while riding (no wrap).
  return Math.round((remaining_c / 3) * 10) / 10;
}
