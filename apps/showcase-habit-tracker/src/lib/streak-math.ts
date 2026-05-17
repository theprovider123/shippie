/**
 * Streak / heatmap math, deliberately separated from React so it stays
 * pure and unit-testable.
 *
 * Voice-doc rule (carried from the Quiet showcase): we never frame a
 * missed day as "broken". The functions here surface continuous and
 * return metrics side-by-side; *what* the UI emphasises is the UI's
 * choice.
 */

import type { Habit, HabitCheck, CheckStatus } from '../types.ts';

/** ISO date (`YYYY-MM-DD`) for a Date or ISO string. */
export function dayKey(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

/** Add `days` to an ISO day key. Stable across DST because we use UTC. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Pick the dominant status for a habit on a given day. If there's any
 * `done` check for that day, the day is `done`; else `partial` if any
 * partial; else `missed`.
 *
 * Returns `null` when there's no record at all — callers may render a
 * "missed" or "n/a" cell depending on context (a day before the habit
 * was created should be n/a, not missed).
 */
export function statusForDay(
  habitId: string,
  day: string,
  checks: readonly HabitCheck[],
): CheckStatus | null {
  let best: CheckStatus | null = null;
  for (const c of checks) {
    if (c.habitId !== habitId) continue;
    if (c.checkedAt.slice(0, 10) !== day) continue;
    if (c.status === 'done') return 'done';
    if (c.status === 'partial') best = 'partial';
    else if (best === null) best = 'missed';
  }
  return best;
}

/**
 * Continuous streak ending today: how many consecutive days back from
 * `today` (inclusive) the habit was at least partial.
 *
 * Anti-punishment voice: we still expose this number, but the UI pairs
 * it with `returnRate` so the user can read "I do come back" alongside
 * "I'm on day 3".
 */
export function currentStreak(
  habitId: string,
  today: string,
  checks: readonly HabitCheck[],
): number {
  let day = today;
  let count = 0;
  // Cap at one year to avoid pathological loops.
  for (let i = 0; i < 365; i++) {
    const s = statusForDay(habitId, day, checks);
    if (s === 'done' || s === 'partial') {
      count += 1;
      day = addDays(day, -1);
    } else {
      break;
    }
  }
  return count;
}

/**
 * Best historical streak across all checks. Used as a soft "you did
 * this once" reference, not as a target.
 */
export function bestStreak(
  habitId: string,
  checks: readonly HabitCheck[],
): number {
  const dayList = Array.from(
    new Set(
      checks
        .filter((c) => c.habitId === habitId && (c.status === 'done' || c.status === 'partial'))
        .map((c) => c.checkedAt.slice(0, 10)),
    ),
  ).sort();
  if (dayList.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < dayList.length; i++) {
    if (addDays(dayList[i - 1]!, 1) === dayList[i]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/**
 * Heatmap cell — what one square in the year-view paints. `null` means
 * "before the habit existed" (rendered blank, not missed).
 */
export interface HeatmapCell {
  day: string;
  status: CheckStatus | null;
}

/**
 * Build a contiguous year ending on `today` (365 cells inclusive). For
 * days before the habit was created we emit `null`, so the wall stays
 * honest.
 */
export function buildHeatmap(
  habit: Pick<Habit, 'id' | 'createdAt'>,
  today: string,
  checks: readonly HabitCheck[],
  span = 365,
): HeatmapCell[] {
  const created = habit.createdAt.slice(0, 10);
  const out: HeatmapCell[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    if (day < created) {
      out.push({ day, status: null });
      continue;
    }
    out.push({ day, status: statusForDay(habit.id, day, checks) });
  }
  return out;
}
