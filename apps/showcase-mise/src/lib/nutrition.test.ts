import { describe, expect, test } from 'bun:test';
import type { Nutrients } from './foods-data';
import { SEED_FOODS_BY_ID } from './foods-data';
import type { Entry, Slot } from './types';
import {
  EMPTY_NUTRIENTS,
  addNutrients,
  macroBreakdown,
  mealTiming,
  nutrientsForServings,
  progressToward,
  proteinBySlot,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  totalsForEntries,
  withinCeiling,
} from './nutrition';

function n(p: Partial<Nutrients>): Nutrients {
  return { ...EMPTY_NUTRIENTS, ...p };
}

function entry(nut: Partial<Nutrients>, slot: Slot, iso: string): Entry {
  return {
    id: `e_${iso}_${slot}`,
    name: 'x',
    slot,
    qty: 1,
    grams: 100,
    nutrients: n(nut),
    logged_at: iso,
  };
}

const chicken = SEED_FOODS_BY_ID.get('seed_chicken_breast')!;

describe('scaling', () => {
  test('scaleNutrients is linear in grams', () => {
    const at200 = scaleNutrients(chicken.per100, 200);
    expect(at200.protein_g).toBeCloseTo(chicken.per100.protein_g * 2, 5);
    expect(at200.kcal).toBeCloseTo(chicken.per100.kcal * 2, 5);
  });

  test('nutrientsForServings uses the default serving grams', () => {
    const one = nutrientsForServings(chicken, 1);
    const expected = scaleNutrients(chicken.per100, chicken.serving.grams);
    expect(one.protein_g).toBeCloseTo(expected.protein_g, 5);
    expect(nutrientsForServings(chicken, 2).kcal).toBeCloseTo(one.kcal * 2, 5);
  });
});

describe('aggregation', () => {
  test('addNutrients and sumNutrients accumulate every field', () => {
    const a = n({ kcal: 100, protein_g: 10 });
    const b = n({ kcal: 50, fat_g: 5 });
    expect(addNutrients(a, b)).toMatchObject({ kcal: 150, protein_g: 10, fat_g: 5 });
    expect(sumNutrients([a, b, a]).kcal).toBe(250);
  });

  test('totalsForEntries sums entry snapshots', () => {
    const total = totalsForEntries([
      entry({ kcal: 300, protein_g: 30 }, 'breakfast', '2026-05-29T08:00:00'),
      entry({ kcal: 200, protein_g: 10 }, 'lunch', '2026-05-29T12:30:00'),
    ]);
    expect(total.kcal).toBe(500);
    expect(total.protein_g).toBe(40);
  });
});

describe('macros', () => {
  test('macroBreakdown percentages sum to ~100', () => {
    const mb = macroBreakdown(n({ protein_g: 25, carb_g: 50, fat_g: 10 }));
    expect(mb.proteinPct + mb.carbPct + mb.fatPct).toBeGreaterThanOrEqual(99);
    expect(mb.proteinPct + mb.carbPct + mb.fatPct).toBeLessThanOrEqual(101);
  });

  test('macroBreakdown is all-zero with no energy', () => {
    expect(macroBreakdown(EMPTY_NUTRIENTS)).toMatchObject({ proteinPct: 0, carbPct: 0, fatPct: 0 });
  });
});

describe('protein distribution', () => {
  test('proteinBySlot returns every slot and sums per slot', () => {
    const by = proteinBySlot([
      entry({ protein_g: 20 }, 'breakfast', '2026-05-29T08:00:00'),
      entry({ protein_g: 30 }, 'dinner', '2026-05-29T19:00:00'),
      entry({ protein_g: 10 }, 'dinner', '2026-05-29T20:00:00'),
    ]);
    expect(by.breakfast).toBe(20);
    expect(by.dinner).toBe(40);
    expect(by.lunch).toBe(0);
    expect(Object.keys(by).sort()).toEqual(['breakfast', 'dinner', 'drink', 'lunch', 'snack']);
  });
});

describe('neutral progress', () => {
  test('progressToward reports remaining and reached without judgement', () => {
    const p = progressToward(80, 120);
    expect(p.remaining).toBe(40);
    expect(p.reached).toBe(false);
    expect(p.ratio).toBeCloseTo(80 / 120, 5);
    expect(progressToward(130, 120).reached).toBe(true);
    expect(progressToward(130, 120).remaining).toBe(0);
  });

  test('withinCeiling flags over as information, never failure', () => {
    const under = withinCeiling(1200, 2300);
    expect(under.over).toBe(false);
    expect(under.headroom).toBe(1100);
    const over = withinCeiling(2600, 2300);
    expect(over.over).toBe(true);
    expect(over.overBy).toBe(300);
    // the shape carries no boolean named like a verdict
    expect(Object.keys(over)).not.toContain('failed');
    expect(Object.keys(over)).not.toContain('bad');
  });
});

describe('timing', () => {
  test('mealTiming computes window and largest gap', () => {
    const t = mealTiming([
      entry({}, 'breakfast', '2026-05-29T08:00:00'),
      entry({}, 'lunch', '2026-05-29T13:00:00'),
      entry({}, 'dinner', '2026-05-29T19:00:00'),
    ]);
    expect(t.count).toBe(3);
    expect(t.firstHour).toBe(8);
    expect(t.lastHour).toBe(19);
    expect(t.windowHours).toBeCloseTo(11, 1);
    expect(t.largestGapHours).toBeCloseTo(6, 1);
  });

  test('mealTiming on empty is well-formed', () => {
    expect(mealTiming([])).toMatchObject({ count: 0, firstHour: null, windowHours: 0 });
  });
});

describe('rounding', () => {
  test('roundNutrients rounds energy to integer and macros to 0.1', () => {
    const r = roundNutrients(n({ kcal: 123.7, protein_g: 12.34, sodium_mg: 99.6 }));
    expect(r.kcal).toBe(124);
    expect(r.protein_g).toBe(12.3);
    expect(r.sodium_mg).toBe(100);
  });
});
