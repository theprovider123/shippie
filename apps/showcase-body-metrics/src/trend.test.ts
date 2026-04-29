import { describe, expect, test } from 'bun:test';
import { computeTrend } from './trend.ts';

function span(days: number, fn: (i: number) => number) {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 3, i + 1)).toISOString().slice(0, 10),
    weightKg: fn(i),
  }));
}

describe('computeTrend', () => {
  test('returns null below 7 samples', () => {
    expect(computeTrend(span(5, (i) => 70 + i))).toBeNull();
  });

  test('detects an upward trend', () => {
    const out = computeTrend(span(10, (i) => 70 + i * 0.2));
    expect(out?.trend).toBe('up');
    expect(out?.slope).toBeGreaterThan(0.05);
  });

  test('detects a downward trend', () => {
    const out = computeTrend(span(10, (i) => 80 - i * 0.3));
    expect(out?.trend).toBe('down');
    expect(out?.slope).toBeLessThan(-0.05);
  });

  test('flat data returns stable', () => {
    const out = computeTrend(span(14, () => 75));
    expect(out?.trend).toBe('stable');
  });

  test('tiny noise stays stable', () => {
    const out = computeTrend(span(10, (i) => 75 + (i % 2 ? 0.02 : -0.02)));
    expect(out?.trend).toBe('stable');
  });
});
