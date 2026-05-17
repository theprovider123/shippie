import { describe, expect, test } from 'bun:test';
import { rollupWeek } from './nutrition-rollup.ts';
import type { Plan, PlanCell } from './types.ts';

function cell(overrides: Partial<PlanCell> = {}): PlanCell {
  return {
    recipeName: 'Test',
    ingredients: [],
    servings: 1,
    baseServings: 1,
    nutrition: { calories: 500, protein: 25, carbs: 60, fat: 18, fibre: 6 },
    ...overrides,
  };
}

describe('rollupWeek', () => {
  test('returns zeros for an empty plan', () => {
    const out = rollupWeek({});
    expect(out.weekTotals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
    expect(out.trackedSlots).toBe(0);
    expect(out.untrackedSlots).toBe(0);
    expect(out.byDay).toHaveLength(7);
  });

  test('sums macros across the week', () => {
    const plan: Plan = {
      Mon: { Dinner: cell() },
      Tue: { Lunch: cell(), Dinner: cell() },
    };
    const out = rollupWeek(plan);
    expect(out.weekTotals.calories).toBe(1500);
    expect(out.weekTotals.protein).toBe(75);
    expect(out.trackedSlots).toBe(3);
  });

  test('multiplies nutrition by servings', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ servings: 2, baseServings: 2 }) },
    };
    const out = rollupWeek(plan);
    expect(out.weekTotals.calories).toBe(1000);
    expect(out.weekTotals.protein).toBe(50);
  });

  test('flags slots with no nutrition as untracked, never fabricates', () => {
    const plan: Plan = {
      Mon: { Dinner: cell({ nutrition: undefined }) },
      Tue: { Dinner: cell() },
    };
    const out = rollupWeek(plan);
    expect(out.untrackedSlots).toBe(1);
    expect(out.trackedSlots).toBe(1);
    expect(out.weekTotals.calories).toBe(500);
  });

  test('per-day totals match per-slot data', () => {
    const plan: Plan = {
      Mon: { Breakfast: cell({ nutrition: { calories: 300, protein: 10, carbs: 40, fat: 8, fibre: 4 } }), Dinner: cell() },
    };
    const out = rollupWeek(plan);
    const mon = out.byDay.find((d) => d.day === 'Mon')!;
    expect(mon.totals.calories).toBe(800);
    expect(mon.trackedSlots).toBe(2);
  });
});
