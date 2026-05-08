/**
 * Return-rate metric — the anti-punishment counterpart to streak.
 *
 * The framing comes from the Habit Tracker spec: the durable signal
 * isn't "how unbroken is the chain" but "how often do you come back".
 * If you missed Tuesday and showed up Wednesday, the chain is broken
 * but the return is intact.
 *
 * Definitions:
 *  - **Active days**: ISO day buckets in the window with any check
 *    (done or partial). `missed` checks alone don't count — we only
 *    record a check on a day the user opened the app.
 *  - **Return**: the day after a *gap* of one or more days that ended
 *    with the user showing up again.
 *  - **Return rate**: returns / opportunities-to-return. An
 *    opportunity-to-return is any gap that ever closed in the window.
 *
 * The result is a fraction `[0, 1]`. The UI renders it as "you average
 * N days a week" by multiplying through `daysPerWeek()`, which is a
 * plainer human reading of the same shape of data.
 */

import type { HabitCheck } from '../types.ts';
import { addDays } from './streak-math.ts';

export interface ReturnStats {
  /** Active days in the window (≥1 check that day, status done|partial). */
  activeDays: number;
  /** Days in the window from the habit's first active day to today inclusive. */
  windowDays: number;
  /** Returns: gap days followed by a re-engagement. */
  returns: number;
  /** Average active days per 7-day chunk. */
  daysPerWeek: number;
}

function activeDaySet(habitId: string, checks: readonly HabitCheck[]): Set<string> {
  const out = new Set<string>();
  for (const c of checks) {
    if (c.habitId !== habitId) continue;
    if (c.status === 'done' || c.status === 'partial') {
      out.add(c.checkedAt.slice(0, 10));
    }
  }
  return out;
}

/**
 * Compute the return stats for one habit over a sliding window ending
 * at `today` (inclusive). Default `windowDays` is 28 — four weeks is
 * long enough to smooth a single rough patch, short enough to stay
 * relevant to "what am I doing right now".
 */
export function returnStats(
  habitId: string,
  today: string,
  checks: readonly HabitCheck[],
  windowDays = 28,
): ReturnStats {
  const active = activeDaySet(habitId, checks);
  const windowStart = addDays(today, -(windowDays - 1));

  let activeInWindow = 0;
  let returns = 0;
  let prevActive = false;
  let everActive = false;

  for (let i = 0; i < windowDays; i++) {
    const day = addDays(windowStart, i);
    const isActive = active.has(day);
    if (isActive) {
      activeInWindow += 1;
      if (everActive && !prevActive) returns += 1;
      everActive = true;
    }
    prevActive = isActive;
  }

  const daysPerWeek = (activeInWindow / windowDays) * 7;
  return {
    activeDays: activeInWindow,
    windowDays,
    returns,
    daysPerWeek: Math.round(daysPerWeek * 10) / 10,
  };
}

/**
 * The phrase the UI uses. Plain copy, no "consistency: 57%".
 */
export function returnPhrase(stats: ReturnStats): string {
  if (stats.activeDays === 0) return 'no days yet';
  if (stats.daysPerWeek >= 6.5) return 'most days';
  return `~${stats.daysPerWeek} days a week`;
}
