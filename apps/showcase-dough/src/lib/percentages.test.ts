import { describe, expect, test } from 'bun:test';
import {
  computeWeights,
  validateFlourMix,
  flourLabel,
  leavenLabel,
  type RecipeSpec,
} from './percentages';

const SPEC: RecipeSpec = {
  flours: [
    { kind: 'bread', pct: 80 },
    { kind: 'whole-wheat', pct: 20 },
  ],
  hydration: 76,
  salt: 2,
  leavenPct: 20,
  leaven: 'sourdough',
};

describe('computeWeights', () => {
  test('returns sane shape for the canonical sourdough spec at 900g', () => {
    const w = computeWeights(SPEC, 900);
    expect(w.flour_g).toBeGreaterThan(400);
    expect(w.flour_g).toBeLessThan(600);
    expect(w.water_g).toBeCloseTo(w.flour_g * 0.76, -1);
    expect(w.salt_g).toBeCloseTo(w.flour_g * 0.02, 0);
    expect(w.leaven_g).toBeCloseTo(w.flour_g * 0.2, 0);
    expect(w.total_g).toBeGreaterThan(890);
    expect(w.total_g).toBeLessThan(910);
  });

  test('flour breakdown sums (within rounding) to flour_g', () => {
    const w = computeWeights(SPEC, 900);
    const sum = w.flour_breakdown.reduce((acc, p) => acc + p.grams, 0);
    expect(Math.abs(sum - w.flour_g)).toBeLessThanOrEqual(2);
  });

  test('returns zeros for non-positive target', () => {
    const w = computeWeights(SPEC, 0);
    expect(w.flour_g).toBe(0);
    expect(w.water_g).toBe(0);
    expect(w.total_g).toBe(0);
  });

  test('scales linearly with target weight', () => {
    const a = computeWeights(SPEC, 500);
    const b = computeWeights(SPEC, 1500);
    // 3x the dough = ~3x the flour (allow a single gram of rounding drift).
    expect(b.flour_g / a.flour_g).toBeCloseTo(3, 0);
  });

  test('respects hydration percentage', () => {
    const stiff = computeWeights({ ...SPEC, hydration: 60 }, 1000);
    const wet = computeWeights({ ...SPEC, hydration: 85 }, 1000);
    expect(stiff.water_g).toBeLessThan(wet.water_g);
    expect(wet.water_g / wet.flour_g).toBeCloseTo(0.85, 1);
  });

  test('100% single-flour mix has a single breakdown entry', () => {
    const w = computeWeights(
      { ...SPEC, flours: [{ kind: '00', pct: 100 }] },
      500,
    );
    expect(w.flour_breakdown.length).toBe(1);
    expect(w.flour_breakdown[0]!.kind).toBe('00');
    expect(w.flour_breakdown[0]!.grams).toBe(w.flour_g);
  });
});

describe('validateFlourMix', () => {
  test('passes a 100% sum', () => {
    expect(validateFlourMix([{ kind: 'bread', pct: 100 }])).toBeNull();
    expect(
      validateFlourMix([
        { kind: 'bread', pct: 70 },
        { kind: 'whole-wheat', pct: 20 },
        { kind: 'rye', pct: 10 },
      ]),
    ).toBeNull();
  });

  test('rejects sums that are off', () => {
    expect(validateFlourMix([{ kind: 'bread', pct: 90 }])).toMatch(/100/);
    expect(
      validateFlourMix([
        { kind: 'bread', pct: 60 },
        { kind: 'rye', pct: 60 },
      ]),
    ).toMatch(/100/);
  });

  test('rejects empty mix', () => {
    expect(validateFlourMix([])).toMatch(/at least one/);
  });

  test('rejects negative parts', () => {
    expect(
      validateFlourMix([
        { kind: 'bread', pct: 110 },
        { kind: 'rye', pct: -10 },
      ]),
    ).toMatch(/negative/);
  });
});

describe('label helpers', () => {
  test('flourLabel covers every kind', () => {
    expect(flourLabel('bread')).toBe('Bread flour');
    expect(flourLabel('all-purpose')).toBe('All-purpose');
    expect(flourLabel('whole-wheat')).toBe('Whole-wheat');
    expect(flourLabel('rye')).toBe('Rye');
    expect(flourLabel('spelt')).toBe('Spelt');
    expect(flourLabel('durum')).toBe('Durum');
    expect(flourLabel('00')).toBe('"00"');
  });

  test('leavenLabel covers every kind', () => {
    expect(leavenLabel('sourdough')).toBe('Levain');
    expect(leavenLabel('instant-yeast')).toBe('Instant yeast');
    expect(leavenLabel('fresh-yeast')).toBe('Fresh yeast');
    expect(leavenLabel('poolish')).toBe('Poolish');
  });
});
