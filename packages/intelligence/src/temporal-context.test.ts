import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { _resetIntelligenceDbForTest, appendPageView } from './storage.ts';
import { temporalContext } from './temporal-context.ts';

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

/** Build a timestamp for a specific local-time hour on 2026-04-23 (a Thursday). */
function thursdayAt(hour: number, minute = 0): number {
  // Month is 0-indexed: 3 = April. Year/month/day chosen so getDay() === 4.
  return new Date(2026, 3, 23, hour, minute, 0, 0).getTime();
}

/** Build a timestamp for a specific local-time hour on 2026-04-25 (a Saturday). */
function saturdayAt(hour: number, minute = 0): number {
  return new Date(2026, 3, 25, hour, minute, 0, 0).getTime();
}

describe('intelligence/temporal-context', () => {
  test('empty data returns short available time + 0ms duration', async () => {
    const result = await temporalContext({ now: thursdayAt(19) });
    expect(result.timeOfDay).toBe('evening');
    expect(result.dayOfWeek).toBe('thursday');
    expect(result.expectedSessionDurationMs).toBe(0);
    expect(result.availableTime).toBe('short');
  });

  test('timeOfDay maps each canonical hour correctly', async () => {
    const cases: Array<{ hour: number; expected: string }> = [
      { hour: 6, expected: 'early-morning' }, // 5-9
      { hour: 10, expected: 'morning' }, // 9-12
      { hour: 14, expected: 'afternoon' }, // 12-17
      { hour: 19, expected: 'evening' }, // 17-21
      { hour: 23, expected: 'night' }, // 21-5 (late side)
      { hour: 2, expected: 'night' }, // 21-5 (early side)
      { hour: 5, expected: 'early-morning' }, // boundary
    ];
    for (const { hour, expected } of cases) {
      const result = await temporalContext({ now: thursdayAt(hour) });
      expect(result.timeOfDay).toBe(expected);
    }
  });

  test('dayOfWeek maps Thursday and Saturday correctly', async () => {
    const thu = await temporalContext({ now: thursdayAt(10) });
    expect(thu.dayOfWeek).toBe('thursday');

    const sat = await temporalContext({ now: saturdayAt(10) });
    expect(sat.dayOfWeek).toBe('saturday');
  });

  test('only same-bucket sessions count toward median (extended evening case)', async () => {
    // Two prior Thursdays' worth of evening sessions, each ~30min.
    // Plus a morning session that should NOT contribute.
    const lastThuEveStart = thursdayAt(19) - 7 * 24 * 60 * 60 * 1000;
    const twoThusAgoEveStart = thursdayAt(19) - 14 * 24 * 60 * 60 * 1000;

    // Evening session 1: 30 min (1800000ms).
    await appendPageView({ path: '/recipes', ts: lastThuEveStart, durationMs: 60_000 });
    await appendPageView({
      path: '/recipes/1',
      ts: lastThuEveStart + 60_000,
      durationMs: 30 * 60 * 1000 - 60_000,
    });

    // Evening session 2: 30 min.
    await appendPageView({
      path: '/recipes',
      ts: twoThusAgoEveStart,
      durationMs: 60_000,
    });
    await appendPageView({
      path: '/recipes/2',
      ts: twoThusAgoEveStart + 60_000,
      durationMs: 30 * 60 * 1000 - 60_000,
    });

    // Morning session: 5 min — must be filtered out (different bucket).
    const morningStart = thursdayAt(10) - 7 * 24 * 60 * 60 * 1000;
    await appendPageView({ path: '/', ts: morningStart, durationMs: 5 * 60 * 1000 });

    const result = await temporalContext({ now: thursdayAt(19) });
    expect(result.timeOfDay).toBe('evening');
    expect(result.expectedSessionDurationMs).toBe(30 * 60 * 1000);
    expect(result.availableTime).toBe('extended');
  });

  test('medium bucket: median around 10 minutes', async () => {
    // Two prior afternoon sessions of 10 minutes each.
    const day1 = thursdayAt(14) - 7 * 24 * 60 * 60 * 1000;
    const day2 = thursdayAt(14) - 14 * 24 * 60 * 60 * 1000;

    await appendPageView({ path: '/a', ts: day1, durationMs: 10 * 60 * 1000 });
    await appendPageView({ path: '/b', ts: day2, durationMs: 10 * 60 * 1000 });

    const result = await temporalContext({ now: thursdayAt(14) });
    expect(result.timeOfDay).toBe('afternoon');
    expect(result.expectedSessionDurationMs).toBe(10 * 60 * 1000);
    expect(result.availableTime).toBe('medium');
  });

  test('short bucket: median under 5 minutes', async () => {
    // Two prior morning sessions of 2 minutes each.
    const day1 = thursdayAt(10) - 7 * 24 * 60 * 60 * 1000;
    const day2 = thursdayAt(10) - 14 * 24 * 60 * 60 * 1000;

    await appendPageView({ path: '/a', ts: day1, durationMs: 2 * 60 * 1000 });
    await appendPageView({ path: '/b', ts: day2, durationMs: 2 * 60 * 1000 });

    const result = await temporalContext({ now: thursdayAt(10) });
    expect(result.timeOfDay).toBe('morning');
    expect(result.expectedSessionDurationMs).toBe(2 * 60 * 1000);
    expect(result.availableTime).toBe('short');
  });

  test('sessions are split by >5min inactivity gap', async () => {
    // One Thursday afternoon: two distinct sessions separated by 10min gap.
    // Session A: starts at 14:00, single 1-min view.
    // Session B: starts at 14:11 (10min gap from end of A), single 1-min view.
    // Both fall in 'afternoon' bucket; medians should be 60_000ms.
    const lastThu = thursdayAt(14) - 7 * 24 * 60 * 60 * 1000;

    await appendPageView({ path: '/a', ts: lastThu, durationMs: 60_000 });
    await appendPageView({
      path: '/b',
      ts: lastThu + 11 * 60 * 1000,
      durationMs: 60_000,
    });

    const result = await temporalContext({ now: thursdayAt(14) });
    expect(result.timeOfDay).toBe('afternoon');
    // Two sessions, each 60s: median is 60s.
    expect(result.expectedSessionDurationMs).toBe(60_000);
    expect(result.availableTime).toBe('short');
  });
});
