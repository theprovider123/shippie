/**
 * Honest goal projection.
 *
 * Given the user's recent trajectory (weekly delta from
 * `computeTrend`) and a target (weight + date), we surface:
 *
 *   - required weekly delta to hit the target on time
 *   - current weekly delta (smoothed via the regression slope)
 *   - the projected hit-date at the *current* pace
 *   - a one-line status: "on-track" | "ahead" | "behind" | "wrong-direction"
 *
 * Voice rules (enforced by the consumer, but expressed here):
 *
 *   - never use "crush", "smash", "transformation"
 *   - if the user's current pace would *miss*, say so plainly with a
 *     concrete date; never sugar-coat
 *   - if the user is moving the wrong direction, say "your trend is
 *     going up but your goal is below your current weight" —
 *     don't moralise
 */

import type { Measurement } from './trend.ts';
import { computeTrend, weeklyDeltaKg } from './trend.ts';

export interface GoalInput {
  /** kg target. */
  weightKg: number;
  targetDate: string; // YYYY-MM-DD
  startWeightKg: number;
  startDate: string; // YYYY-MM-DD
}

export type ProjectionStatus =
  | 'on-track'
  | 'ahead'
  | 'behind'
  | 'wrong-direction'
  | 'insufficient-data';

export interface Projection {
  status: ProjectionStatus;
  /** kg of weight change required. Positive = gain, negative = lose. */
  requiredDeltaKg: number;
  /** Required average kg/week between today and target date. */
  requiredWeeklyKg: number;
  /** Current observed kg/week (linear regression slope * 7). null below MIN_SAMPLE. */
  currentWeeklyKg: number | null;
  /** Number of days between `today` and target date (negative if past). */
  daysToTarget: number;
  /** YYYY-MM-DD when the user's current pace would land them on `goal.weightKg`. null if pace is zero or wrong direction. */
  projectedHitDate: string | null;
  /** Most recent weight used as "today" reading. */
  currentWeightKg: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function todayDate(today: Date): string {
  // ISO date in local-ish form. We slice the UTC representation since
  // the rest of the app stores YYYY-MM-DD without TZ; consistent across.
  return today.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T00:00:00Z`).getTime();
  const b = new Date(`${toYmd}T00:00:00Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

function addDays(fromYmd: string, days: number): string {
  const t = new Date(`${fromYmd}T00:00:00Z`).getTime() + days * MS_PER_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

export function projectGoal(
  goal: GoalInput,
  measurements: readonly Measurement[],
  now: Date = new Date(),
): Projection {
  const today = todayDate(now);
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1) ?? null;
  const currentWeightKg = last?.weightKg ?? null;
  const daysToTarget = daysBetween(today, goal.targetDate);

  if (currentWeightKg === null) {
    return {
      status: 'insufficient-data',
      requiredDeltaKg: goal.weightKg - goal.startWeightKg,
      requiredWeeklyKg: 0,
      currentWeeklyKg: null,
      daysToTarget,
      projectedHitDate: null,
      currentWeightKg: null,
    };
  }

  const requiredDeltaKg = goal.weightKg - currentWeightKg;
  const requiredWeeklyKg =
    daysToTarget > 0 ? (requiredDeltaKg / daysToTarget) * 7 : requiredDeltaKg;

  const currentWeeklyKg = weeklyDeltaKg(measurements);

  // Projection date — only meaningful with a smoothed trend.
  let projectedHitDate: string | null = null;
  let status: ProjectionStatus;

  if (currentWeeklyKg === null) {
    // Not enough data to project — but we can still say "you need x".
    status = 'insufficient-data';
  } else {
    const wantsLoss = requiredDeltaKg < 0;
    const wantsGain = requiredDeltaKg > 0;
    const movingDown = currentWeeklyKg < 0;
    const movingUp = currentWeeklyKg > 0;
    const wrongDirection =
      (wantsLoss && movingUp) || (wantsGain && movingDown);

    if (wrongDirection) {
      status = 'wrong-direction';
    } else if (Math.abs(requiredDeltaKg) < 0.05) {
      // Already there or essentially there.
      status = 'on-track';
      projectedHitDate = today;
    } else if (Math.abs(currentWeeklyKg) < 1e-6) {
      // Stable but not at goal — won't get there.
      status = 'behind';
    } else {
      // Same direction. Compute days to hit goal at current pace.
      const slopeKgPerDay = currentWeeklyKg / 7;
      const daysToHit = requiredDeltaKg / slopeKgPerDay; // positive — same sign as deltaKg/slope
      projectedHitDate = addDays(today, Math.max(0, Math.round(daysToHit)));
      const projectedDays = Math.round(daysToHit);
      if (projectedDays <= daysToTarget) {
        // Faster than required — only call "ahead" if meaningfully so.
        const margin = daysToTarget - projectedDays;
        status = margin >= 3 ? 'ahead' : 'on-track';
      } else {
        status = 'behind';
      }
    }
  }

  return {
    status,
    requiredDeltaKg,
    requiredWeeklyKg,
    currentWeeklyKg,
    daysToTarget,
    projectedHitDate,
    currentWeightKg,
  };
}

/**
 * Plain copy for the projection. Keeps the voice honest: never
 * "you're crushing it"; never "transformation". Always concrete dates
 * and concrete kilograms.
 */
export function describeProjection(p: Projection, goal: GoalInput): string {
  if (p.status === 'insufficient-data') {
    if (p.currentWeightKg === null) {
      return 'Log a few entries and we can show your trajectory.';
    }
    return `You need ${formatDelta(p.requiredDeltaKg)} kg to reach ${goal.weightKg} kg by ${goal.targetDate}. We need a couple more weeks of data before we can project a hit date.`;
  }
  if (p.status === 'on-track' && p.projectedHitDate === todayLocal()) {
    return `You're at ${goal.weightKg.toFixed(1)} kg — you're already there.`;
  }
  if (p.status === 'wrong-direction') {
    const dir = p.requiredDeltaKg < 0 ? 'down' : 'up';
    const opp = dir === 'down' ? 'up' : 'down';
    return `Your trend is going ${opp} right now, but your target is ${dir} from where you are. The pace will need to flip before any projection is honest.`;
  }
  if (p.status === 'on-track' && p.projectedHitDate) {
    return `At your current pace you'd reach ${goal.weightKg.toFixed(1)} kg around ${p.projectedHitDate} — about your target date.`;
  }
  if (p.status === 'ahead' && p.projectedHitDate) {
    return `At your current pace you'd reach ${goal.weightKg.toFixed(1)} kg around ${p.projectedHitDate} — earlier than ${goal.targetDate}.`;
  }
  if (p.status === 'behind') {
    if (p.projectedHitDate) {
      return `At your current pace you'd reach ${goal.weightKg.toFixed(1)} kg around ${p.projectedHitDate} — past ${goal.targetDate}. To hit the target you'd need ~${Math.abs(p.requiredWeeklyKg).toFixed(2)} kg/week.`;
    }
    return `You're moving the right direction but not fast enough. You'd need ~${Math.abs(p.requiredWeeklyKg).toFixed(2)} kg/week to hit ${goal.targetDate}.`;
  }
  return '';
}

function formatDelta(deltaKg: number): string {
  return `${deltaKg > 0 ? '+' : ''}${deltaKg.toFixed(1)}`;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}
