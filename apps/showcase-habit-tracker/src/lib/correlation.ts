/**
 * Correlation surfaces for the Patterns page.
 *
 * Pure functions over `Checkin[]` + `HabitCheck[]` so they can be unit-
 * tested without React. The output is small, plain-language insights —
 * "when you slept ≥7h, your mood averaged 4.1 vs 2.9 the days you
 * didn't" — rather than r-values the user has to interpret.
 *
 * Voice-doc invariant: insights are observations, not prescriptions.
 * We surface "what tends to happen when X" not "you should do X."
 */

import type { Checkin, HabitCheck } from '../types.ts';
import { dayKey } from './streak-math.ts';

/**
 * One observation surfaced on the Patterns page. `delta` is the mean
 * difference on the tracked metric between the high group and the
 * low group; `sample` is how many days went into the high group so
 * the UI can render confidence honestly ("from 9 days").
 */
export interface Pattern {
  /** Stable identifier for keys + dedupe. */
  id: string;
  /** Plain-language headline rendered as the card title. */
  headline: string;
  /** Optional body line — extra context the headline doesn't carry. */
  body?: string;
  /** Sample size in the high group. Lower means weaker confidence. */
  sample: number;
  /** Mean difference between high group and low group on the tracked metric. */
  delta: number;
  /** Loose grouping for filtering / colouring (sleep, movement, etc.). */
  tone: 'sleep' | 'mood' | 'energy' | 'stress' | 'movement' | 'hydration';
}

/** Index check-ins by ISO day key for O(1) lookup. */
function indexCheckinsByDay(checkins: readonly Checkin[]): Map<string, Checkin> {
  const out = new Map<string, Checkin>();
  for (const c of checkins) {
    // Last write wins — same as the UI's record path.
    out.set(c.date, c);
  }
  return out;
}

/** Index "this habit was done on this day" pairs. */
function indexDoneDaysByHabit(checks: readonly HabitCheck[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const c of checks) {
    if (c.status !== 'done' && c.status !== 'partial') continue;
    const day = c.checkedAt.slice(0, 10);
    let set = out.get(c.habitId);
    if (!set) {
      set = new Set<string>();
      out.set(c.habitId, set);
    }
    set.add(day);
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Sleep-hours → next-day energy + mood pattern.
 *
 * If we don't have at least 5 days with sleep + next-day mood/energy,
 * we return nothing — small-sample patterns mislead. The headline
 * names the threshold the user actually hit (≥ rounded median), not a
 * fixed "7 hours" so it adapts to people whose normal is 6h.
 */
function sleepEnergyPattern(checkins: readonly Checkin[]): Pattern | null {
  const byDay = indexCheckinsByDay(checkins);
  const pairs: { sleep: number; nextEnergy: number; nextMood: number }[] = [];
  for (const c of checkins) {
    if (typeof c.sleepHours !== 'number') continue;
    // The next-morning check-in carries the reported energy.
    const nextDay = nextIsoDay(c.date);
    const next = byDay.get(nextDay);
    if (!next) continue;
    const ne = typeof next.energy === 'number' ? next.energy : NaN;
    const nm = typeof next.mood === 'number' ? next.mood : NaN;
    if (!Number.isFinite(ne) && !Number.isFinite(nm)) continue;
    pairs.push({
      sleep: c.sleepHours,
      nextEnergy: Number.isFinite(ne) ? ne : NaN,
      nextMood: Number.isFinite(nm) ? nm : NaN,
    });
  }
  if (pairs.length < 5) return null;
  const sleepSorted = [...pairs].map((p) => p.sleep).sort((a, b) => a - b);
  const median = sleepSorted[Math.floor(sleepSorted.length / 2)] ?? 7;
  const threshold = Math.max(6, Math.round(median * 10) / 10);
  const highEnergy = pairs.filter((p) => p.sleep >= threshold && Number.isFinite(p.nextEnergy)).map((p) => p.nextEnergy);
  const lowEnergy = pairs.filter((p) => p.sleep < threshold && Number.isFinite(p.nextEnergy)).map((p) => p.nextEnergy);
  if (highEnergy.length < 3 || lowEnergy.length < 3) return null;
  const delta = mean(highEnergy) - mean(lowEnergy);
  if (Math.abs(delta) < 0.4) return null;
  const direction = delta > 0 ? 'higher' : 'lower';
  return {
    id: 'sleep-energy',
    headline: `Energy runs ${direction} after sleeping ${threshold}h+.`,
    body: `Mean energy ${mean(highEnergy).toFixed(1)} after ${threshold}h+, ${mean(lowEnergy).toFixed(1)} after less. From ${highEnergy.length} mornings.`,
    sample: highEnergy.length,
    delta,
    tone: 'sleep',
  };
}

/** Movement habit (one whose cue intent is workout-completed) → mood next day. */
function movementMoodPattern(
  habitDoneByDay: Map<string, Set<string>>,
  checkins: readonly Checkin[],
  movementHabitIds: readonly string[],
): Pattern | null {
  if (movementHabitIds.length === 0) return null;
  const byDay = indexCheckinsByDay(checkins);
  const movedDays = new Set<string>();
  for (const id of movementHabitIds) {
    const set = habitDoneByDay.get(id);
    if (set) for (const d of set) movedDays.add(d);
  }
  const moodOnMoved: number[] = [];
  const moodOnRest: number[] = [];
  for (const c of checkins) {
    if (typeof c.mood !== 'number') continue;
    const yest = prevIsoDay(c.date);
    if (movedDays.has(yest)) moodOnMoved.push(c.mood);
    else moodOnRest.push(c.mood);
    void byDay;
  }
  if (moodOnMoved.length < 4 || moodOnRest.length < 4) return null;
  const delta = mean(moodOnMoved) - mean(moodOnRest);
  if (Math.abs(delta) < 0.3) return null;
  const direction = delta > 0 ? 'lifts' : 'softens';
  return {
    id: 'movement-mood',
    headline: `Mood ${direction} the day after you move.`,
    body: `${mean(moodOnMoved).toFixed(1)} vs ${mean(moodOnRest).toFixed(1)} on rest days. From ${moodOnMoved.length} mornings.`,
    sample: moodOnMoved.length,
    delta,
    tone: 'movement',
  };
}

/**
 * Stress vs same-day check-in completion. People who fill in a check-in
 * tend to report stress on the days they did less; the headline reads
 * as the trend, not the trigger.
 */
function stressMovementPattern(
  habitDoneByDay: Map<string, Set<string>>,
  checkins: readonly Checkin[],
  movementHabitIds: readonly string[],
): Pattern | null {
  if (movementHabitIds.length === 0) return null;
  const movedToday: number[] = [];
  const restToday: number[] = [];
  const movedSet = new Set<string>();
  for (const id of movementHabitIds) {
    const set = habitDoneByDay.get(id);
    if (set) for (const d of set) movedSet.add(d);
  }
  for (const c of checkins) {
    if (typeof c.stress !== 'number') continue;
    if (movedSet.has(c.date)) movedToday.push(c.stress);
    else restToday.push(c.stress);
  }
  if (movedToday.length < 4 || restToday.length < 4) return null;
  const delta = mean(movedToday) - mean(restToday);
  if (Math.abs(delta) < 0.3) return null;
  const direction = delta < 0 ? 'lower' : 'higher';
  return {
    id: 'movement-stress',
    headline: `Stress reads ${direction} on movement days.`,
    body: `${mean(movedToday).toFixed(1)} vs ${mean(restToday).toFixed(1)} on rest days. From ${movedToday.length} days.`,
    sample: movedToday.length,
    delta,
    tone: 'stress',
  };
}

/**
 * Build all patterns we can compute from the available data. Returned
 * sorted by sample size descending — the most confident observations
 * lead. The page renders at most 5 to avoid overwhelm.
 */
export function patternsFor(
  checkins: readonly Checkin[],
  checks: readonly HabitCheck[],
  movementHabitIds: readonly string[],
): Pattern[] {
  const habitDoneByDay = indexDoneDaysByHabit(checks);
  const candidates: (Pattern | null)[] = [
    sleepEnergyPattern(checkins),
    movementMoodPattern(habitDoneByDay, checkins, movementHabitIds),
    stressMovementPattern(habitDoneByDay, checkins, movementHabitIds),
  ];
  return candidates
    .filter((p): p is Pattern => p !== null)
    .sort((a, b) => b.sample - a.sample);
}

// Date helpers — local copies so this module stays independent of the
// streak-math + day-key contract. UTC math keeps DST boundary days
// stable across timezones.
function nextIsoDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function prevIsoDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Re-export `dayKey` so the page doesn't have to import streak-math
 * directly when it wants to know "today".
 */
export { dayKey };
