/**
 * Sleep ↔ workout correlation invariants.
 *
 *   1. No sleep rows → all averages null, no delta.
 *   2. Some sleeps but the buckets are below MIN_SAMPLE → no delta
 *      (we don't surface a 1-night-vs-1-night "trend").
 *   3. With enough samples in both buckets, deltaHours is the simple
 *      mean(after) - mean(other).
 *   4. Older-than-windowDays workouts/sleeps are excluded.
 *   5. A sleep stamp >24h after the last workout counts as "other".
 */
import { describe, expect, test } from 'bun:test';
import { correlateSleepWithWorkouts } from './sleep-correlation.ts';

const NOW = Date.parse('2026-04-29T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function workoutAt(daysAgo: number) {
  return { createdAt: new Date(NOW - daysAgo * DAY).toISOString() };
}

function sleepAt(daysAgo: number, hours: number) {
  return { loggedAt: new Date(NOW - daysAgo * DAY).toISOString(), hours };
}

describe('correlateSleepWithWorkouts', () => {
  test('zero sleep rows → null averages and null delta', () => {
    const result = correlateSleepWithWorkouts([workoutAt(1)], [], NOW);
    expect(result.avgHoursAfterWorkout).toBeNull();
    expect(result.avgHoursOtherNights).toBeNull();
    expect(result.deltaHours).toBeNull();
    expect(result.workoutsInWindow).toBe(1);
  });

  test('below MIN_SAMPLE in either bucket → null delta', () => {
    const workouts = [workoutAt(2)];
    const sleeps = [sleepAt(2, 7.5), sleepAt(5, 6)]; // 1-after + 1-other
    const result = correlateSleepWithWorkouts(workouts, sleeps, NOW);
    expect(result.avgHoursAfterWorkout).toBe(7.5);
    expect(result.avgHoursOtherNights).toBe(6);
    expect(result.deltaHours).toBeNull();
  });

  test('enough samples → delta = mean(after) - mean(other)', () => {
    // Workouts at days 0, 4, 8 → sleeps at the SAME day count as
    // "after" (the rule is sleep.at >= workout.at and within 24h).
    // Sleeps at days 2, 6, 10 land outside the 24h window from any
    // workout, so they bucket as "other".
    const workouts = [workoutAt(0), workoutAt(4), workoutAt(8)];
    const sleeps = [
      sleepAt(0, 8),
      sleepAt(4, 7.5),
      sleepAt(8, 8),
      sleepAt(2, 6),
      sleepAt(6, 6.5),
      sleepAt(10, 6),
    ];
    const result = correlateSleepWithWorkouts(workouts, sleeps, NOW);
    expect(result.avgHoursAfterWorkout).toBeCloseTo((8 + 7.5 + 8) / 3, 5);
    expect(result.avgHoursOtherNights).toBeCloseTo((6 + 6.5 + 6) / 3, 5);
    expect(result.deltaHours).toBeCloseTo(7.833 - 6.166, 1);
  });

  test('respects the windowDays horizon — old data drops out', () => {
    const ancientWorkouts = [workoutAt(30), workoutAt(40)];
    const ancientSleeps = [sleepAt(30, 8), sleepAt(40, 7)];
    const result = correlateSleepWithWorkouts(ancientWorkouts, ancientSleeps, NOW, 14);
    expect(result.workoutsInWindow).toBe(0);
    expect(result.avgHoursAfterWorkout).toBeNull();
    expect(result.avgHoursOtherNights).toBeNull();
  });

  test('a sleep stamped >24h after the last workout counts as "other"', () => {
    // Workout exactly 2 days ago; sleep 6h ago — that's >24h after
    // the workout, so the sleep belongs in the "other" bucket.
    const workouts = [workoutAt(2)];
    const sleeps = [sleepAt(0.25, 9)]; // 6 hours ago
    const result = correlateSleepWithWorkouts(workouts, sleeps, NOW);
    expect(result.avgHoursAfterWorkout).toBeNull();
    expect(result.avgHoursOtherNights).toBe(9);
  });
});
