import { describe, expect, it } from 'bun:test';
import {
  averageIntensityPct,
  computeConsistency,
  muscleGroupVolume,
  totalVolume,
  weeklyVolumeSeries,
  type MuscleSet,
  type SetPoint,
} from './analytics.ts';

const NOW = Date.parse('2026-05-29T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

describe('computeConsistency', () => {
  it('counts sessions in the 7 and 28 day windows', () => {
    const c = computeConsistency([iso(0), iso(3), iso(10), iso(20), iso(40)], NOW);
    expect(c.sessionsLast7).toBe(2);
    expect(c.sessionsLast28).toBe(4);
  });

  it('measures the consecutive weekly streak and stops at a gap', () => {
    // Sessions this week, last week, two weeks ago — then a 3-week gap.
    const c = computeConsistency([iso(1), iso(8), iso(15), iso(40)], NOW);
    expect(c.weeklyStreak).toBe(3);
  });

  it('is zero across the board with no sessions', () => {
    const c = computeConsistency([], NOW);
    expect(c).toEqual({ sessionsLast7: 0, sessionsLast28: 0, weeklyStreak: 0 });
  });
});

describe('volume', () => {
  const sets: SetPoint[] = [
    { weight: 100, reps: 5, completedAt: iso(1) },
    { weight: 100, reps: 5, completedAt: iso(8) },
    { weight: 60, reps: 10, completedAt: iso(1) },
  ];

  it('totals tonnage', () => {
    expect(totalVolume(sets)).toBe(100 * 5 + 100 * 5 + 60 * 10);
  });

  it('buckets tonnage by week, newest last', () => {
    const series = weeklyVolumeSeries(sets, NOW, 4);
    expect(series).toHaveLength(4);
    expect(series[3]).toBe(100 * 5 + 60 * 10); // this week
    expect(series[2]).toBe(100 * 5); // last week
  });
});

describe('averageIntensityPct', () => {
  it('is 100 when all sets are the single heaviest effort', () => {
    const pct = averageIntensityPct([{ weight: 100, reps: 1, completedAt: iso(0) }]);
    expect(pct).toBe(100);
  });

  it('drops below 100 when lighter back-off sets are mixed in', () => {
    const pct = averageIntensityPct([
      { weight: 100, reps: 1, completedAt: iso(0) },
      { weight: 50, reps: 1, completedAt: iso(0) },
    ]);
    expect(pct).toBeLessThan(100);
    expect(pct).toBeGreaterThan(0);
  });

  it('is null with no sets', () => {
    expect(averageIntensityPct([])).toBeNull();
  });
});

describe('muscleGroupVolume', () => {
  it('groups, sorts by volume, and computes share', () => {
    const sets: MuscleSet[] = [
      { weight: 100, reps: 5, completedAt: iso(0), muscleGroup: 'legs' },
      { weight: 100, reps: 5, completedAt: iso(0), muscleGroup: 'legs' },
      { weight: 50, reps: 5, completedAt: iso(0), muscleGroup: 'chest' },
    ];
    const out = muscleGroupVolume(sets);
    expect(out[0]!.muscleGroup).toBe('legs');
    expect(out[0]!.volume).toBe(1000);
    expect(out[0]!.sharePct + out[1]!.sharePct).toBe(100);
  });
});
