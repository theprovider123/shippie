/**
 * Daily-target maths.
 *
 * - hydrationProgress: today's totals vs target.
 * - streak: consecutive days the user hit their water target, ending
 *   yesterday or today (today only counts once it's actually met).
 */

import type { Sip, Targets } from '../db.ts';
import { dayKey, todayKey } from '../db.ts';

export interface HydrationProgress {
  ml: number;
  target_ml: number;
  /** 0–1, capped at 1 for the bar. */
  pct: number;
  /** ml short of target; 0 once the target is met. */
  remaining_ml: number;
  /** True once `ml >= target_ml`. */
  met: boolean;
}

export function hydrationProgress(sips: ReadonlyArray<Sip>, targets: Targets, day_key: string): HydrationProgress {
  let ml = 0;
  for (const s of sips) {
    if (dayKey(s.logged_at) === day_key) ml += s.ml;
  }
  const pct = targets.water_ml > 0 ? Math.min(1, ml / targets.water_ml) : 0;
  const remaining_ml = Math.max(0, targets.water_ml - ml);
  return {
    ml,
    target_ml: targets.water_ml,
    pct,
    remaining_ml,
    met: ml >= targets.water_ml,
  };
}

export interface CaffeineStatus {
  mg: number;
  cap_mg: number;
  pct: number;
  /** Caffeine ingested at or after the cutoff hour. */
  past_cutoff_mg: number;
  over_cap: boolean;
  /** True if any caffeine logged after the cutoff hour. */
  past_cutoff: boolean;
}

export function caffeineStatus(sips: ReadonlyArray<Sip>, targets: Targets, day_key: string): CaffeineStatus {
  let mg = 0;
  let past_cutoff_mg = 0;
  for (const s of sips) {
    if (dayKey(s.logged_at) !== day_key) continue;
    if (s.mg <= 0) continue;
    mg += s.mg;
    const hour = new Date(s.logged_at).getHours();
    if (hour >= targets.caffeine_cutoff_hour) past_cutoff_mg += s.mg;
  }
  return {
    mg,
    cap_mg: targets.caffeine_max_mg,
    pct: targets.caffeine_max_mg > 0 ? Math.min(1, mg / targets.caffeine_max_mg) : 0,
    past_cutoff_mg,
    over_cap: mg > targets.caffeine_max_mg,
    past_cutoff: past_cutoff_mg > 0,
  };
}

/**
 * Streak of consecutive days the water target was met, counting
 * backwards from today. Today counts only if already met.
 *
 * Returns 0 if today (or yesterday, when today isn't met) didn't hit
 * the target — streaks must be unbroken.
 */
export function streakDaysMetTarget(
  sips: ReadonlyArray<Sip>,
  targets: Targets,
  now: Date = new Date(),
): number {
  // Bucket sips by day key for O(n) lookup.
  const byDay = new Map<string, number>();
  for (const s of sips) {
    const k = dayKey(s.logged_at);
    byDay.set(k, (byDay.get(k) ?? 0) + s.ml);
  }
  const todayK = todayKey(now);
  const todayMl = byDay.get(todayK) ?? 0;

  // Anchor: if today met, count it; otherwise start from yesterday.
  let streak = 0;
  const cursor = new Date(now);
  if (todayMl >= targets.water_ml) {
    streak = 1;
  }
  cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const key = todayKey(cursor);
    const ml = byDay.get(key) ?? 0;
    if (ml >= targets.water_ml) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Last 7 days totals (oldest first), for the weekly summary chart.
 */
export interface DayTotal {
  key: string;
  ml: number;
  mg: number;
}

export function last7Days(sips: ReadonlyArray<Sip>, now: Date = new Date()): DayTotal[] {
  const days: DayTotal[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    days.push({ key, ml: 0, mg: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i] as const));
  for (const s of sips) {
    const k = dayKey(s.logged_at);
    const i = idx.get(k);
    if (i === undefined) continue;
    const day = days[i]!;
    day.ml += s.ml;
    day.mg += s.mg;
  }
  return days;
}
