/**
 * Aggregation invariants:
 *   1. bucketByDay always returns exactly `windowDays` entries even
 *      with zero rows — the chart's x-axis is stable.
 *   2. countToday counts only rows whose dayKey === today.
 *   3. heatmapMatrix returns 7 × ceil(windowDays/7) cells; rows
 *      outside the window count as 0.
 *   4. dayKey is timezone-stable (UTC) — multiple loggers in the
 *      same container don't disagree on what "today" is.
 */
import { describe, expect, test } from 'bun:test';
import {
  bucketByDay,
  countToday,
  dayKey,
  heatmapMatrix,
} from './aggregate.ts';

const NOW = Date.parse('2026-04-29T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function row(at: number): { id: string; loggedAt: number; fields: Record<string, unknown> } {
  return { id: `r_${at}`, loggedAt: at, fields: {} };
}

describe('bucketByDay', () => {
  test('returns N buckets even with zero rows', () => {
    const buckets = bucketByDay([], 7);
    expect(buckets.length).toBe(7);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  test('counts rows landing inside the window', () => {
    const rows = [row(NOW), row(NOW - DAY), row(NOW - DAY)];
    const buckets = bucketByDay(rows, 7, NOW);
    expect(buckets.length).toBe(7);
    const today = buckets.find((b) => b.date === dayKey(NOW));
    expect(today?.count).toBe(1);
    const yesterday = buckets.find((b) => b.date === dayKey(NOW - DAY));
    expect(yesterday?.count).toBe(2);
  });
});

describe('countToday', () => {
  test('returns 0 when no rows are from today', () => {
    expect(countToday([row(NOW - DAY)], NOW)).toBe(0);
  });

  test('counts every row whose dayKey matches today', () => {
    const rows = [row(NOW), row(NOW - HOUR), row(NOW - 2 * HOUR), row(NOW - DAY)];
    expect(countToday(rows, NOW)).toBe(3);
  });
});

describe('heatmapMatrix', () => {
  test('returns 7 × ceil(windowDays/7) cells', () => {
    const matrix = heatmapMatrix([], 30, NOW);
    expect(matrix.length).toBe(7 * Math.ceil(30 / 7));
  });

  test('counts rows landing on their day cell', () => {
    const rows = [row(NOW), row(NOW), row(NOW - DAY)];
    const matrix = heatmapMatrix(rows, 14, NOW);
    const today = matrix.find((c) => c.date === dayKey(NOW));
    expect(today?.count).toBe(2);
    const yesterday = matrix.find((c) => c.date === dayKey(NOW - DAY));
    expect(yesterday?.count).toBe(1);
  });
});
