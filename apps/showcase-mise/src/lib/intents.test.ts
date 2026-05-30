import { describe, expect, test } from 'bun:test';
import type { Entry, Nutrients } from './types';
import { EMPTY_NUTRIENTS } from './nutrition';
import { defaultGoals } from './store';
import {
  caffeineRow,
  emptyExternalContext,
  hydrationRow,
  latestWeightKg,
  macroTargetRow,
  mealLoggedRow,
  mergeBodyMetrics,
  mergeCookedMeals,
  mergeCycle,
  mergeMoods,
  mergePantry,
  mergePlannedMeals,
  mergeShopping,
  mergeWorkouts,
  nutritionRowFromEntry,
  parseNutrients,
  proteinTargetRow,
} from './intents';

function entry(over: Partial<Omit<Entry, 'nutrients'>> & { nutrients?: Partial<Nutrients> }): Entry {
  return {
    id: 'e1',
    name: over.name ?? 'Chicken',
    slot: over.slot ?? 'dinner',
    qty: 1,
    grams: 140,
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 231.6, protein_g: 43.4, carb_g: 0, fat_g: 5, ...(over.nutrients ?? {}) },
    logged_at: over.logged_at ?? '2026-05-29T19:00:00',
  };
}

describe('outbound payloads', () => {
  test('nutritionRowFromEntry rounds and carries slot + time', () => {
    const row = nutritionRowFromEntry(entry({}));
    expect(row.kcal).toBe(232);
    expect(row.protein_g).toBe(43.4);
    expect(row.slot).toBe('dinner');
    expect(row.logged_at).toBe('2026-05-29T19:00:00');
  });

  test('mealLoggedRow sums energy + protein and lists items', () => {
    const row = mealLoggedRow(
      'Chicken & rice',
      'lunch',
      [
        entry({ name: 'Chicken', nutrients: { kcal: 230, protein_g: 43 } }),
        entry({ name: 'Rice', nutrients: { kcal: 205, protein_g: 4 } }),
      ],
      '2026-05-29T12:30:00',
    );
    expect(row.kcal).toBe(435);
    expect(row.protein_g).toBe(47);
    expect(row.items).toEqual(['Chicken', 'Rice']);
    expect(row.slot).toBe('lunch');
  });

  test('hydration/caffeine/protein-target rows round their values', () => {
    expect(hydrationRow(249.6, 't')).toEqual({ ml: 250, logged_at: 't' });
    expect(caffeineRow(94.7, 't')).toEqual({ mg: 95, logged_at: 't' });
    expect(proteinTargetRow(140.4, 138.9, '2026-05-29')).toEqual({
      protein_g: 140,
      target_g: 139,
      date: '2026-05-29',
    });
  });

  test('macroTargetRow mirrors the active goals', () => {
    const goals = defaultGoals();
    const row = macroTargetRow(goals);
    expect(row.mode).toBe('maintenance');
    expect(row.kcal).toBe(goals.targets.kcal);
    expect(row.protein_g).toBe(goals.targets.protein_g);
  });
});

describe('parseNutrients', () => {
  test('reads a variety of key spellings', () => {
    expect(parseNutrients({ calories: 500, protein: 30, carbs: 50, fat: 12 })).toMatchObject({
      kcal: 500,
      protein_g: 30,
      carb_g: 50,
      fat_g: 12,
    });
    expect(parseNutrients({ kcal: '450', protein_g: '25' })).toMatchObject({ kcal: 450, protein_g: 25 });
  });

  test('returns undefined when nothing is recognisable', () => {
    expect(parseNutrients({ foo: 'bar' })).toBeUndefined();
  });
});

describe('inbound mergers', () => {
  test('mergeCookedMeals parses name/title and ignores nameless rows', () => {
    const ctx = mergeCookedMeals(emptyExternalContext(), [
      { title: 'Lentil curry', kcal: 480, protein: 22 },
      { kcal: 100 },
      { name: 'Omelette', slot: 'breakfast' },
    ]);
    expect(ctx.cookedMeals.map((m) => m.name)).toEqual(['Lentil curry', 'Omelette']);
    expect(ctx.cookedMeals[0]!.nutrients?.kcal).toBe(480);
    expect(ctx.cookedMeals[1]!.slot).toBe('breakfast');
  });

  test('mergePlannedMeals tags source as meal-planned', () => {
    const ctx = mergePlannedMeals(emptyExternalContext(), [{ name: 'Stir fry' }]);
    expect(ctx.plannedMeals[0]!.source).toBe('meal-planned');
  });

  test('mergePantry/mergeShopping accept strings and objects, dedupe', () => {
    const ctx = mergePantry(emptyExternalContext(), ['eggs', { name: 'milk' }, 'eggs']);
    expect(ctx.pantry.sort()).toEqual(['eggs', 'milk']);
    const sh = mergeShopping(emptyExternalContext(), [{ item: 'spinach' }, 'oats']);
    expect(sh.shopping.sort()).toEqual(['oats', 'spinach']);
  });

  test('workout / cycle / body-metrics / mood mergers extract their fields', () => {
    expect(mergeWorkouts(emptyExternalContext(), [{ type: 'run', calories: 400 }]).workouts[0]!).toMatchObject({
      kind: 'run',
      kcal: 400,
    });
    expect(mergeCycle(emptyExternalContext(), [{ phase: 'luteal', day: 22 }]).cycle[0]!).toMatchObject({
      phase: 'luteal',
      day: 22,
    });
    const bm = mergeBodyMetrics(emptyExternalContext(), [{ weight_kg: 81.2 }]);
    expect(bm.bodyMetrics[0]!.weightKg).toBe(81.2);
    expect(latestWeightKg(bm)).toBe(81.2);
    expect(mergeMoods(emptyExternalContext(), [{ mood: 'tired', score: 2 }]).moods[0]!).toMatchObject({
      mood: 'tired',
      score: 2,
    });
  });

  test('mergers return the same context when there is nothing to add', () => {
    const ctx = emptyExternalContext();
    expect(mergeCookedMeals(ctx, [{ no: 'name' }])).toBe(ctx);
    expect(mergeWorkouts(ctx, [])).toBe(ctx);
  });

  test('latestWeightKg is undefined with no data', () => {
    expect(latestWeightKg(emptyExternalContext())).toBeUndefined();
  });
});
