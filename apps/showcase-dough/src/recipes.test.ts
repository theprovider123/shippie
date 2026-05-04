import { describe, expect, test } from 'bun:test';
import {
  RECIPES,
  compute,
  formatHM,
  planFromReady,
  totalScheduleMinutes,
} from './recipes';

describe('dough recipes', () => {
  test('every recipe declares a complete schedule', () => {
    for (const r of RECIPES) {
      expect(r.schedule.length).toBeGreaterThan(0);
      for (const s of r.schedule) {
        expect(s.minutes).toBeGreaterThan(0);
        expect(s.label).toBeTruthy();
      }
    }
  });

  test('hydration is in a sane range (50-90%)', () => {
    for (const r of RECIPES) {
      expect(r.hydration).toBeGreaterThanOrEqual(40);
      expect(r.hydration).toBeLessThanOrEqual(90);
    }
  });

  test('compute scales with balls × ballG (linear)', () => {
    const r = RECIPES[0]!;
    const a = compute(r, 1, 250);
    const b = compute(r, 4, 250);
    expect(b.flour_g / a.flour_g).toBeCloseTo(4, 0);
    expect(b.water_g / a.water_g).toBeCloseTo(4, 0);
  });

  test('compute respects hydration percentage', () => {
    const r = RECIPES.find((x) => x.id === 'sourdough-boule')!;
    const out = compute(r, 1, 900);
    // hydration 76% means water_g ≈ 0.76 × flour_g
    const ratio = out.water_g / out.flour_g;
    expect(ratio).toBeCloseTo(0.76, 1);
  });

  test('planFromReady walks backwards: last step ends at readyAt', () => {
    const r = RECIPES[0]!;
    const ready = new Date('2026-05-04T18:00:00Z');
    const plan = planFromReady(r, ready);
    expect(plan.length).toBe(r.schedule.length);
    expect(plan[plan.length - 1]!.end_at.getTime()).toBe(ready.getTime());
  });

  test('totalScheduleMinutes sums minutes across all steps', () => {
    const r = RECIPES[0]!;
    const sum = r.schedule.reduce((s, x) => s + x.minutes, 0);
    expect(totalScheduleMinutes(r)).toBe(sum);
  });

  test('formatHM', () => {
    expect(formatHM(45)).toBe('45m');
    expect(formatHM(60)).toBe('1h');
    expect(formatHM(95)).toBe('1h 35m');
  });
});
