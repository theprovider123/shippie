/**
 * Progression engine — the coach in your pocket.
 *
 * Given a target (sets × reps) and how the last session actually went,
 * recommend the next session's load. This is linear / double-progression
 * with honest stall handling and missed-session recovery:
 *
 *   - Hit every target rep at the target weight   → ADVANCE (+ increment)
 *   - Hit the weight but not all the reps          → HOLD (repeat, consolidate)
 *   - Stalled for N sessions running               → DELOAD (−10%, build back)
 *   - First time on the lift / no history          → HOLD (find your working weight)
 *   - Came back after a gap longer than a week      → REPEAT (don't advance cold)
 *
 * Pure and deterministic. The UI surfaces `nextWeight` as a suggestion on
 * the set card; the lifter is always free to ignore it.
 */

export type ProgressionAction = 'advance' | 'hold' | 'deload' | 'repeat';

export interface ProgressionRecommendation {
  action: ProgressionAction;
  /** Suggested working weight for the next session. */
  nextWeight: number;
  reason: string;
}

export interface ProgressionInput {
  /** Target reps per working set (e.g. 5 in a 5×5). */
  targetReps: number;
  /** Target number of working sets. */
  targetSets: number;
  /** Smallest weight jump available (2.5 kg / 5 lb typical). */
  increment: number;
  /**
   * The most recent session's working sets for this exercise, in order.
   * Empty means no history — we hold.
   */
  lastSessionSets: readonly { weight: number; reps: number }[];
  /**
   * Days since that last session. A long gap triggers REPEAT rather than
   * ADVANCE: ramping cold off a layoff invites injury.
   */
  daysSinceLast?: number;
  /**
   * How many consecutive past sessions failed to complete the target at
   * this weight. Reaching `deloadAfter` triggers a deload.
   */
  consecutiveStalls?: number;
  /** Stalls tolerated before a deload (default 3). */
  deloadAfter?: number;
  /** Deload fraction of working weight (default 0.9). */
  deloadFactor?: number;
}

const STALE_GAP_DAYS = 10;

export function recommendProgression(input: ProgressionInput): ProgressionRecommendation {
  const {
    targetReps,
    targetSets,
    increment,
    lastSessionSets,
    daysSinceLast = 0,
    consecutiveStalls = 0,
    deloadAfter = 3,
    deloadFactor = 0.9,
  } = input;

  if (lastSessionSets.length === 0) {
    return {
      action: 'hold',
      nextWeight: 0,
      reason: 'No history yet — log a session to find your working weight.',
    };
  }

  // Working weight = the heaviest weight used last session (warmups already
  // excluded by the caller).
  const workingWeight = Math.max(...lastSessionSets.map((s) => s.weight));
  const setsAtWorking = lastSessionSets.filter((s) => s.weight >= workingWeight);

  // Deload takes priority — a true stall shouldn't keep grinding.
  if (consecutiveStalls >= deloadAfter) {
    return {
      action: 'deload',
      nextWeight: roundToIncrement(workingWeight * deloadFactor, increment),
      reason: `Stalled ${consecutiveStalls} sessions. Deload to ${Math.round(deloadFactor * 100)}% and build back.`,
    };
  }

  // Coming back from a layoff — repeat, don't advance.
  if (daysSinceLast > STALE_GAP_DAYS) {
    return {
      action: 'repeat',
      nextWeight: workingWeight,
      reason: `${daysSinceLast} days off — repeat last weight to find your feet again.`,
    };
  }

  const hitAllReps =
    setsAtWorking.length >= targetSets && setsAtWorking.every((s) => s.reps >= targetReps);

  if (hitAllReps) {
    return {
      action: 'advance',
      nextWeight: roundToIncrement(workingWeight + increment, increment),
      reason: `Hit ${targetSets}×${targetReps} at ${trim(workingWeight)} — add ${trim(increment)}.`,
    };
  }

  return {
    action: 'hold',
    nextWeight: workingWeight,
    reason: `Repeat ${trim(workingWeight)} until all ${targetSets}×${targetReps} are clean.`,
  };
}

function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return round(weight);
  return round(Math.round(weight / increment) * increment);
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
