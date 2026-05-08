/**
 * Weekly review prompt synthesis.
 *
 * Voice-doc rule: actionable, not judgemental. We never say "you
 * failed". The tone is plain — "did 5/7", "dropped vs last week",
 * "want to lower the target" — and any suggestion is offered, not
 * imposed.
 */

import type { Habit, HabitCheck } from '../types.ts';
import { addDays, statusForDay } from './streak-math.ts';

export interface WeekStats {
  habitId: string;
  habitName: string;
  daysActive: number;
  /** Days the habit was active last week, for delta. */
  daysActiveLastWeek: number;
  /** "up" / "flat" / "down" relative to last week. */
  trend: 'up' | 'flat' | 'down';
}

/**
 * Find the ISO Monday for a given ISO day. ISO weeks start Monday.
 */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  // shift so Monday=0
  const shift = (dow + 6) % 7;
  return addDays(day, -shift);
}

/** ISO week label like `2026-W18`. */
export function isoWeekLabel(day: string): string {
  // Source: ISO 8601 week-numbering algorithm.
  const d = new Date(`${day}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.getTime();
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((firstThursday - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function activeDaysInRange(
  habitId: string,
  checks: readonly HabitCheck[],
  start: string,
  spanDays: number,
): number {
  let count = 0;
  for (let i = 0; i < spanDays; i++) {
    const day = addDays(start, i);
    const s = statusForDay(habitId, day, checks);
    if (s === 'done' || s === 'partial') count += 1;
  }
  return count;
}

/**
 * Stats for the ISO week containing `today` and the prior ISO week.
 */
export function weekStatsForHabits(
  habits: readonly Habit[],
  today: string,
  checks: readonly HabitCheck[],
): WeekStats[] {
  const thisStart = weekStart(today);
  const lastStart = addDays(thisStart, -7);
  return habits
    .filter((h) => !h.archivedAt)
    .map((h) => {
      const a = activeDaysInRange(h.id, checks, thisStart, 7);
      const b = activeDaysInRange(h.id, checks, lastStart, 7);
      const trend: WeekStats['trend'] = a > b ? 'up' : a < b ? 'down' : 'flat';
      return { habitId: h.id, habitName: h.name, daysActive: a, daysActiveLastWeek: b, trend };
    });
}

/**
 * Plain-language synthesis. Produces the four kinds of line the
 * weekly-review surface uses, in priority order so the UI can pick
 * the top 1–3.
 */
export function reviewLines(stats: readonly WeekStats[]): string[] {
  const lines: string[] = [];
  // 1. wins worth naming
  for (const s of stats) {
    if (s.daysActive >= 7) lines.push(`${s.habitName}: every day this week. Nice rhythm.`);
    else if (s.daysActive >= 5 && s.trend === 'up') lines.push(`${s.habitName}: ${s.daysActive}/7 — up from last week.`);
  }
  // 2. soft drops — name them, don't scold
  for (const s of stats) {
    if (s.trend === 'down' && s.daysActive < s.daysActiveLastWeek - 1) {
      const delta = s.daysActiveLastWeek - s.daysActive;
      lines.push(
        `${s.habitName}: ${s.daysActive}/7 (was ${s.daysActiveLastWeek}). Want to lower the target or skip a planned day?`,
      );
      void delta;
    }
  }
  // 3. flat-but-low — offer a phase-in option
  for (const s of stats) {
    if (s.daysActive <= 1 && s.daysActiveLastWeek <= 1) {
      lines.push(`${s.habitName}: ${s.daysActive}/7 two weeks running. Smaller version, or pause?`);
    }
  }
  // 4. simple report when nothing else applies
  if (lines.length === 0) {
    for (const s of stats) lines.push(`${s.habitName}: ${s.daysActive}/7.`);
  }
  return lines;
}

/**
 * "You're trying to start N hard habits at once" — Atomic Habits' ramp
 * warning. Returns a soft suggestion or `null`.
 */
export function rampWarning(habits: readonly Habit[]): string | null {
  const newHard = habits.filter(
    (h) => !h.archivedAt && h.difficulty === 'hard',
  );
  // Only count habits younger than 14 days as "starting".
  const cutoff = addDays(new Date().toISOString().slice(0, 10), -14);
  const recent = newHard.filter((h) => h.createdAt.slice(0, 10) >= cutoff);
  if (recent.length >= 3) {
    return `You're starting ${recent.length} hard habits at once. Phasing them — one this week, the others later — tends to stick better.`;
  }
  return null;
}
