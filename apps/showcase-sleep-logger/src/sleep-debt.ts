/**
 * P3 — sleep-debt running average.
 *
 * Pure function: given a sequence of sleep durations (hours) and a
 * target (default 8h), return cumulative debt. Positive debt means
 * the user is short on sleep relative to the target; negative means
 * they're banking surplus.
 *
 * The component renders the headline number; this module just does
 * the arithmetic so it can be tested without React.
 */

export interface NightForDebt {
  date: string;
  hours: number;
}

export function computeSleepDebt(
  nights: readonly NightForDebt[],
  targetHours: number = 8,
  windowDays: number = 14,
): { totalDebtHours: number; nightsCounted: number; targetHours: number } {
  // Use the most recent `windowDays` nights, regardless of how many
  // entries are stored. Falling out of the window doesn't dredge up
  // an old debt the user has long since paid back.
  const recent = nights.slice(0, windowDays);
  let total = 0;
  for (const night of recent) {
    if (Number.isFinite(night.hours)) total += targetHours - night.hours;
  }
  return {
    totalDebtHours: total,
    nightsCounted: recent.length,
    targetHours,
  };
}

/**
 * Compute the duration in hours between bedtime + wake-time strings
 * (HH:mm). Crosses midnight cleanly — wake before bedtime means we
 * slept past midnight.
 */
export function hoursSlept(bedtime: string, wakeTime: string): number {
  const bed = parseClock(bedtime);
  const wake = parseClock(wakeTime);
  if (bed === null || wake === null) return 0;
  const diff = wake >= bed ? wake - bed : 24 * 60 - bed + wake;
  return Math.round((diff / 60) * 10) / 10;
}

function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
