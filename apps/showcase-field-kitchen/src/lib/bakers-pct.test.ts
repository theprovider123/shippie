import { describe, expect, it } from 'bun:test';
import {
  clampPercent,
  HYDRATION_MAX,
  HYDRATION_MIN,
  looksReasonable,
  weighDough,
} from './bakers-pct.ts';

describe('clampPercent', () => {
  it('respects min and max', () => {
    expect(clampPercent(5, 10, 20, 15)).toBe(10);
    expect(clampPercent(50, 10, 20, 15)).toBe(20);
  });

  it('rounds to one decimal', () => {
    expect(clampPercent(12.345, 0, 100, 0)).toBe(12.3);
  });

  it('falls back when given garbage', () => {
    expect(clampPercent('hi', 10, 20, 15)).toBe(15);
  });
});

describe('weighDough', () => {
  it('computes weights for a 1000g, 70% hydration sourdough', () => {
    const w = weighDough({ flour_g: 1000, hydration: 70, salt_pct: 2, leaven_pct: 20 });
    expect(w.flour_g).toBe(1000);
    expect(w.water_g).toBe(700);
    expect(w.salt_g).toBe(20);
    expect(w.leaven_g).toBe(200);
    expect(w.total_g).toBe(1920);
  });

  it('clamps hydration to its bounds', () => {
    const high = weighDough({ flour_g: 500, hydration: 200, salt_pct: 2, leaven_pct: 20 });
    expect(high.water_g).toBe(Math.round(500 * (HYDRATION_MAX / 100)));
    const low = weighDough({ flour_g: 500, hydration: -10, salt_pct: 2, leaven_pct: 20 });
    expect(low.water_g).toBe(Math.round(500 * (HYDRATION_MIN / 100)));
  });

  it('handles tiny batches', () => {
    const w = weighDough({ flour_g: 100, hydration: 65, salt_pct: 2, leaven_pct: 15 });
    expect(w.flour_g).toBe(100);
    expect(w.water_g).toBe(65);
    expect(w.salt_g).toBeCloseTo(2, 1);
    expect(w.leaven_g).toBe(15);
  });
});

describe('looksReasonable', () => {
  it('accepts a normal sourdough', () => {
    expect(
      looksReasonable({ flour_g: 1000, hydration: 75, salt_pct: 2, leaven_pct: 20 }),
    ).toBe(true);
  });

  it('rejects no-salt dough', () => {
    expect(
      looksReasonable({ flour_g: 1000, hydration: 75, salt_pct: 0, leaven_pct: 20 }),
    ).toBe(false);
  });

  it('rejects 30% hydration', () => {
    expect(
      looksReasonable({ flour_g: 1000, hydration: 30, salt_pct: 2, leaven_pct: 20 }),
    ).toBe(false);
  });
});
