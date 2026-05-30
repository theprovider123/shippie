/**
 * Training analytics — the honest numbers, no vanity dashboard.
 *
 * Four lenses the spec asks for, each a pure function:
 *   - consistency  → sessions in the last 7/28 days + current weekly streak
 *   - volume       → working-set tonnage, plus a per-week series
 *   - intensity    → average load as a % of estimated 1RM in the window
 *   - muscle split → where the volume actually landed, by muscle group
 *
 * "Strain"/fatigue lives in strain.ts (4-week ramp) and feeds the deload
 * prompt; this module covers the steady-state picture.
 */
import { estimateOneRepMax } from './one-rep-max.ts';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export interface ConsistencyStats {
  sessionsLast7: number;
  sessionsLast28: number;
  /** Consecutive weeks (ending this week) with at least one session. */
  weeklyStreak: number;
}

/** Sessions per window + the current "weeks training in a row" streak. */
export function computeConsistency(
  completedAt: readonly string[],
  now: number,
): ConsistencyStats {
  const times = completedAt
    .map((s) => Date.parse(s))
    .filter((t) => !Number.isNaN(t) && t <= now)
    .sort((a, b) => b - a);

  const sessionsLast7 = times.filter((t) => t >= now - WEEK).length;
  const sessionsLast28 = times.filter((t) => t >= now - 4 * WEEK).length;

  // Weekly streak: walk back week by week from the current week; stop at
  // the first week with zero sessions.
  let weeklyStreak = 0;
  for (let week = 0; week < 52; week++) {
    const hi = now - week * WEEK;
    const lo = now - (week + 1) * WEEK;
    const any = times.some((t) => t <= hi && t > lo);
    if (any) weeklyStreak++;
    else break;
  }

  return { sessionsLast7, sessionsLast28, weeklyStreak };
}

export interface SetPoint {
  weight: number;
  reps: number;
  /** ISO timestamp. */
  completedAt: string;
}

/** Total working-set tonnage (Σ weight × reps). */
export function totalVolume(sets: readonly SetPoint[]): number {
  return Math.round(sets.reduce((acc, s) => acc + s.weight * s.reps, 0));
}

/** Tonnage per week, oldest → newest, over the trailing `weeks` weeks. */
export function weeklyVolumeSeries(
  sets: readonly SetPoint[],
  now: number,
  weeks = 8,
): number[] {
  const series = new Array(weeks).fill(0);
  for (const s of sets) {
    const t = Date.parse(s.completedAt);
    if (Number.isNaN(t) || t > now) continue;
    const weeksAgo = Math.floor((now - t) / WEEK);
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    series[weeks - 1 - weeksAgo] += s.weight * s.reps;
  }
  return series.map((v) => Math.round(v));
}

/**
 * Average working load as a % of estimated 1RM across the set list.
 * The reference 1RM is the best e1RM seen in the same list, so this is a
 * self-relative intensity — "how heavy, for you, this block".
 */
export function averageIntensityPct(sets: readonly SetPoint[]): number | null {
  if (sets.length === 0) return null;
  let refMax = 0;
  for (const s of sets) {
    const e = estimateOneRepMax(s.weight, s.reps).estimate;
    if (e > refMax) refMax = e;
  }
  if (refMax <= 0) return null;
  const ratios = sets.map((s) => s.weight / refMax);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.round(mean * 100);
}

export interface MuscleSet extends SetPoint {
  muscleGroup: string;
}

/** Working-set tonnage grouped by muscle group, descending. */
export function muscleGroupVolume(
  sets: readonly MuscleSet[],
): Array<{ muscleGroup: string; volume: number; sharePct: number }> {
  const tally = new Map<string, number>();
  let total = 0;
  for (const s of sets) {
    const v = s.weight * s.reps;
    tally.set(s.muscleGroup, (tally.get(s.muscleGroup) ?? 0) + v);
    total += v;
  }
  return [...tally.entries()]
    .map(([muscleGroup, volume]) => ({
      muscleGroup,
      volume: Math.round(volume),
      sharePct: total > 0 ? Math.round((volume / total) * 100) : 0,
    }))
    .sort((a, b) => b.volume - a.volume);
}
