import { describe, expect, test } from 'bun:test';
import {
  RECIPES,
  compute,
  computeWeights,
  modeForLeaven,
  planFromReady,
  totalMinutes,
} from './recipes';
import { validateFlourMix } from './lib/percentages';

describe('preset recipes', () => {
  test('every preset declares a non-empty stage list', () => {
    for (const r of RECIPES) {
      expect(r.stages.length).toBeGreaterThan(0);
      for (const s of r.stages) {
        expect(s.label).toBeTruthy();
        expect(s.minutes).toBeGreaterThanOrEqual(0);
        expect(s.prompt.length).toBeGreaterThan(10);
      }
    }
  });

  test('every preset has a flour mix that sums to 100%', () => {
    for (const r of RECIPES) {
      expect(validateFlourMix(r.flours)).toBeNull();
    }
  });

  test('hydration is in a sane range across presets (50-90%)', () => {
    for (const r of RECIPES) {
      expect(r.hydration).toBeGreaterThanOrEqual(50);
      expect(r.hydration).toBeLessThanOrEqual(90);
    }
  });

  test('salt sits in 1.0–2.8% across presets', () => {
    for (const r of RECIPES) {
      expect(r.salt).toBeGreaterThanOrEqual(1.0);
      expect(r.salt).toBeLessThanOrEqual(2.8);
    }
  });

  test('compute() (legacy shim) scales with balls × ballG', () => {
    const r = RECIPES[0]!;
    const a = compute(r, 1, 250);
    const b = compute(r, 4, 250);
    expect(b.flour_g / a.flour_g).toBeCloseTo(4, 0);
  });

  test('computeWeights respects hydration percentage on the country sourdough', () => {
    const r = RECIPES.find((x) => x.id === 'sourdough-country')!;
    const out = computeWeights(r, 900);
    const ratio = out.water_g / out.flour_g;
    expect(ratio).toBeCloseTo(r.hydration / 100, 1);
  });

  test('planFromReady walks backwards: last stage ends at readyAt', () => {
    const r = RECIPES[0]!;
    const ready = new Date('2026-05-04T18:00:00Z');
    const plan = planFromReady(r.stages, ready);
    expect(plan.stages.length).toBe(r.stages.length);
    expect(plan.stages[plan.stages.length - 1]!.endAt.getTime()).toBe(
      ready.getTime(),
    );
  });

  test('totalMinutes sums minutes across all stages', () => {
    const r = RECIPES[0]!;
    const sum = r.stages.reduce((acc, s) => acc + s.minutes, 0);
    expect(totalMinutes(r.stages)).toBe(sum);
  });

  test('modeForLeaven maps sourdough → sourdough, others → yeast', () => {
    expect(modeForLeaven('sourdough')).toBe('sourdough');
    expect(modeForLeaven('instant-yeast')).toBe('yeast');
    expect(modeForLeaven('fresh-yeast')).toBe('yeast');
    expect(modeForLeaven('poolish')).toBe('yeast');
  });

  test('sourdough presets have feed-starter + cold-retard stages', () => {
    const sd = RECIPES.find((r) => r.id === 'sourdough-country')!;
    expect(sd.stages.find((s) => s.kind === 'feed-starter')).toBeTruthy();
    expect(sd.stages.find((s) => s.kind === 'cold-retard')).toBeTruthy();
  });

  test('NY pizza preset uses cold-retard for the 24h cold proof', () => {
    const ny = RECIPES.find((r) => r.id === 'pizza-ny')!;
    const retard = ny.stages.find((s) => s.kind === 'cold-retard');
    expect(retard).toBeTruthy();
    expect(retard!.minutes).toBe(24 * 60);
  });
});
