import { describe, expect, test } from 'bun:test';
import { computeTrend, rollingAverage, weeklyDeltaKg } from './trend.ts';

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

describe('rollingAverage', () => {
  test('returns one point per measurement', () => {
    const out = rollingAverage(span(10, (i) => 70 + i));
    expect(out.length).toBe(10);
  });

  test('pads lead-in with null until window is full', () => {
    const out = rollingAverage(span(10, (i) => 70 + i), 7);
    expect(out.slice(0, 6).every((p) => p.rollingKg === null)).toBe(true);
    expect(out[6]!.rollingKg).toBeCloseTo(73, 5);
  });

  test('rolling line smooths out alternating daily noise', () => {
    // Flat underlying weight plus alternating ±0.5 kg noise.
    // The rolling mean of a full window of alternating signal is ~0,
    // so it should sit near 75 even when the daily reading is at the
    // noisy ±0.5 extreme.
    const out = rollingAverage(
      span(14, (i) => 75 + (i % 2 ? 0.5 : -0.5)),
      7,
    );
    const last = out.at(-1)!;
    expect(Math.abs(last.rollingKg! - 75)).toBeLessThan(0.2);
  });

  test('throws on a non-positive window', () => {
    expect(() => rollingAverage(span(3, (i) => 70 + i), 0)).toThrow();
  });
});

describe('weeklyDeltaKg', () => {
  test('returns null below MIN_SAMPLE', () => {
    expect(weeklyDeltaKg(span(3, (i) => 70 + i))).toBeNull();
  });

  test('roughly +1.4 kg/week given 0.2 kg/day', () => {
    const out = weeklyDeltaKg(span(10, (i) => 70 + i * 0.2));
    expect(out).not.toBeNull();
    expect(Math.abs((out as number) - 1.4)).toBeLessThan(0.1);
  });
});
