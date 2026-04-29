/**
 * P3 — sleep ↔ workout correlation.
 *
 * Pure correlation logic. The component subscribes to `sleep-logged`,
 * caches the most recent rows, and feeds both arrays into this. We
 * stay heuristic-light: no statistics package, no fancy timeseries
 * fitting. Just average sleep on nights AFTER a workout vs nights
 * not-after, and surface the delta. The 14-day window keeps the
 * sample fresh.
 */
export interface SleepRow {
  /** ISO8601 datetime — slept the night ending around this stamp. */
  loggedAt: string;
  /** Hours slept; we tolerate either decimal (7.4) or whole-hour ints. */
  hours: number;
}

export interface WorkoutRow {
  createdAt: string;
}

export interface SleepCorrelation {
  windowDays: number;
  workoutsInWindow: number;
  avgHoursAfterWorkout: number | null;
  avgHoursOtherNights: number | null;
  /** Positive ⇒ better sleep after workouts. Null when not enough data. */
  deltaHours: number | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SAMPLE = 3; // need at least 3 nights in each bucket for the delta

export function correlateSleepWithWorkouts(
  workouts: readonly WorkoutRow[],
  sleeps: readonly SleepRow[],
  now: number = Date.now(),
  windowDays: number = 14,
): SleepCorrelation {
  const horizon = now - windowDays * ONE_DAY_MS;
  const recentWorkouts = workouts
    .map((w) => Date.parse(w.createdAt))
    .filter((t) => Number.isFinite(t) && t >= horizon)
    .sort((a, b) => a - b);
  const recentSleeps = sleeps
    .map((s) => ({ at: Date.parse(s.loggedAt), hours: s.hours }))
    .filter((s) => Number.isFinite(s.at) && s.at >= horizon && Number.isFinite(s.hours))
    .sort((a, b) => a.at - b.at);

  if (recentSleeps.length === 0) {
    return {
      windowDays,
      workoutsInWindow: recentWorkouts.length,
      avgHoursAfterWorkout: null,
      avgHoursOtherNights: null,
      deltaHours: null,
    };
  }

  const afterWorkout: number[] = [];
  const otherNights: number[] = [];
  for (const sleep of recentSleeps) {
    // A night counts as "after a workout" when the most recent
    // workout finished within the prior 24 hours of the sleep stamp.
    const had = recentWorkouts.some((w) => sleep.at - w >= 0 && sleep.at - w <= ONE_DAY_MS);
    (had ? afterWorkout : otherNights).push(sleep.hours);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length;
  const after = avg(afterWorkout);
  const other = avg(otherNights);
  const enough = afterWorkout.length >= MIN_SAMPLE && otherNights.length >= MIN_SAMPLE;
  return {
    windowDays,
    workoutsInWindow: recentWorkouts.length,
    avgHoursAfterWorkout: after,
    avgHoursOtherNights: other,
    deltaHours: enough && after !== null && other !== null ? after - other : null,
  };
}
