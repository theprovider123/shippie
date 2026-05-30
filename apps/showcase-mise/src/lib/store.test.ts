import { describe, expect, test } from 'bun:test';
import { SEED_FOODS_BY_ID } from './foods-data';
import type { Entry, Meal, Slot } from './types';
import { EMPTY_NUTRIENTS } from './nutrition';
import type { ImportedMeal } from './intents';
import {
  allFoods,
  copyYesterday,
  defaultGoals,
  entriesFromMeal,
  entryFromFood,
  entryFromGrams,
  entryFromImportedMeal,
  entryFromQuickItem,
  exportData,
  foodById,
  frequentItems,
  normalise,
  parseImport,
  pruneEntries,
  recentItems,
  toggleFavorite,
  totalsForMeal,
} from './store';

const chicken = SEED_FOODS_BY_ID.get('seed_chicken_breast')!;
const rice = SEED_FOODS_BY_ID.get('seed_rice_white')!;

function entry(over: Partial<Entry>): Entry {
  return {
    id: over.id ?? `e_${Math.random()}`,
    name: over.name ?? 'x',
    slot: over.slot ?? 'lunch',
    qty: over.qty ?? 1,
    grams: over.grams ?? 100,
    nutrients: over.nutrients ?? { ...EMPTY_NUTRIENTS, protein_g: 10 },
    logged_at: over.logged_at ?? '2026-05-29T12:00:00',
    ...(over.foodId ? { foodId: over.foodId } : {}),
  };
}

describe('normalise', () => {
  test('garbage becomes a clean default', () => {
    const d = normalise('not an object');
    expect(d.entries).toEqual([]);
    expect(d.goals.mode).toBe('maintenance');
    expect(d.version).toBe(1);
  });

  test('drops malformed entries, keeps valid ones', () => {
    const out = normalise({
      entries: [{ id: 'a', name: 'ok', slot: 'lunch', logged_at: '2026-05-29T12:00:00', nutrients: {} }, { id: 'bad' }],
    });
    expect(out.entries.length).toBe(1);
  });

  test('recomputes targets for the stored mode + bodyweight', () => {
    const out = normalise({ goals: { mode: 'fat-loss', bodyweightKg: 80, units: 'metric' } });
    expect(out.goals.mode).toBe('fat-loss');
    expect(out.goals.bodyweightKg).toBe(80);
    expect(out.goals.targets.protein_g).toBeGreaterThan(0);
  });
});

describe('entry construction', () => {
  test('entryFromFood snapshots scaled nutrients', () => {
    const e = entryFromFood(chicken, 2, 'dinner');
    expect(e.foodId).toBe(chicken.id);
    expect(e.grams).toBe(Math.round(chicken.serving.grams * 2));
    expect(e.nutrients.protein_g).toBeGreaterThan(0);
    expect(e.slot).toBe('dinner');
  });

  test('entryFromGrams with no food yields empty nutrients but a name', () => {
    const e = entryFromGrams(null, 'Mystery stew', 250, 'dinner');
    expect(e.foodId).toBeUndefined();
    expect(e.nutrients.kcal).toBe(0);
    expect(e.name).toBe('Mystery stew');
    expect(e.grams).toBe(250);
  });

  test('entryFromGrams with a food scales by grams', () => {
    const e = entryFromGrams(rice, rice.name, 150, 'lunch');
    expect(e.nutrients.carb_g).toBeGreaterThan(0);
    expect(e.foodId).toBe(rice.id);
  });

  test('entriesFromMeal expands items into editable entries', () => {
    const meal: Meal = {
      id: 'm1',
      name: 'Chicken & rice',
      items: [
        { foodId: chicken.id, qty: 1 },
        { foodId: rice.id, qty: 1.5 },
      ],
      createdAt: '2026-05-29T12:00:00',
    };
    const entries = entriesFromMeal(meal, [], 'lunch');
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.source === 'meal')).toBe(true);
    expect(totalsForMeal(meal, []).protein_g).toBeGreaterThan(0);
  });

  test('entryFromImportedMeal fills partial nutrients and tags origin', () => {
    const meal: ImportedMeal = {
      name: 'Lentil curry',
      at: '2026-05-29T19:00:00',
      source: 'cooked-meal',
      nutrients: { kcal: 480, protein_g: 22 },
    };
    const e = entryFromImportedMeal(meal, 'dinner');
    expect(e.nutrients.kcal).toBe(480);
    expect(e.nutrients.protein_g).toBe(22);
    expect(e.nutrients.fat_g).toBe(0);
    expect(e.note).toContain('Palate');
    expect(e.source).toBe('import');
  });
});

describe('copyYesterday', () => {
  test('clones yesterday into today keeping time-of-day, fresh ids', () => {
    const now = new Date('2026-05-29T10:00:00');
    const entries: Entry[] = [
      entry({ id: 'y1', logged_at: '2026-05-28T08:30:00', name: 'Oats' }),
      entry({ id: 'y2', logged_at: '2026-05-28T19:00:00', name: 'Salmon' }),
      entry({ id: 't1', logged_at: '2026-05-29T07:00:00', name: 'Coffee' }),
    ];
    const cloned = copyYesterday(entries, now);
    expect(cloned.length).toBe(2);
    expect(cloned.map((e) => e.name).sort()).toEqual(['Oats', 'Salmon']);
    for (const c of cloned) {
      expect(c.logged_at.startsWith('2026-05-29')).toBe(true);
      expect(c.source).toBe('copy');
    }
    expect(cloned.map((e) => e.id)).not.toContain('y1');
    expect(new Date(cloned[0]!.logged_at).getHours()).toBe(8);
  });

  test('no yesterday entries → empty clone', () => {
    const now = new Date('2026-05-29T10:00:00');
    expect(copyYesterday([entry({ logged_at: '2026-05-29T07:00:00' })], now)).toEqual([]);
  });
});

describe('quick items', () => {
  const entries: Entry[] = [
    entry({ id: '1', foodId: chicken.id, name: 'Chicken', logged_at: '2026-05-29T19:00:00' }),
    entry({ id: '2', foodId: chicken.id, name: 'Chicken', logged_at: '2026-05-28T19:00:00' }),
    entry({ id: '3', foodId: rice.id, name: 'Rice', logged_at: '2026-05-29T13:00:00' }),
    entry({ id: '4', name: 'Mum stew', logged_at: '2026-05-27T19:00:00' }),
  ];

  test('recentItems are distinct, newest first', () => {
    const r = recentItems(entries);
    expect(r[0]!.name).toBe('Chicken');
    const keys = r.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.some((x) => x.name === 'Mum stew')).toBe(true);
  });

  test('frequentItems rank by count', () => {
    const f = frequentItems(entries, 12, 30, new Date('2026-05-29T23:00:00'));
    expect(f[0]!.name).toBe('Chicken');
    expect(f[0]!.count).toBe(2);
  });

  test('entryFromQuickItem makes a fresh dated entry', () => {
    const item = recentItems(entries)[0]!;
    const e = entryFromQuickItem(item, 'dinner', new Date('2026-05-30T18:00:00'));
    expect(e.slot).toBe('dinner');
    expect(e.logged_at.startsWith('2026-05-30')).toBe(true);
    expect(e.id).not.toBe('1');
  });
});

describe('favorites & food resolution', () => {
  test('toggleFavorite adds then removes', () => {
    const a = toggleFavorite([], chicken.id);
    expect(a).toContain(chicken.id);
    expect(toggleFavorite(a, chicken.id)).not.toContain(chicken.id);
  });

  test('allFoods applies favorite flag and merges custom first', () => {
    const custom = [
      { ...chicken, id: 'custom_1', name: 'My blend', source: 'custom' as const },
    ];
    const merged = allFoods(custom, ['custom_1']);
    expect(merged[0]!.id).toBe('custom_1');
    expect(merged.find((f) => f.id === 'custom_1')?.favorite).toBe(true);
  });

  test('foodById resolves seed and custom', () => {
    expect(foodById(chicken.id, [])?.id).toBe(chicken.id);
    const custom = [{ ...chicken, id: 'custom_2', source: 'custom' as const }];
    expect(foodById('custom_2', custom)?.id).toBe('custom_2');
    expect(foodById(undefined, [])).toBeUndefined();
  });
});

describe('pruning & export', () => {
  test('pruneEntries drops entries older than a year', () => {
    const now = Date.parse('2026-05-29T00:00:00');
    const kept = entry({ logged_at: '2026-05-01T12:00:00' });
    const old = entry({ logged_at: '2024-01-01T12:00:00' });
    const out = pruneEntries([kept, old], now);
    expect(out.length).toBe(1);
  });

  test('exportData → parseImport round-trips entries', () => {
    const state = {
      version: 1 as const,
      entries: [entry({ id: 'keep', logged_at: '2026-05-29T12:00:00' })],
      foods: [],
      meals: [],
      goals: defaultGoals(),
      favoriteFoodIds: [],
      external: parseImport(exportData(normalise({})))!.external,
      enrich: { enabled: false },
    };
    const text = exportData(state);
    const back = parseImport(text);
    expect(back).not.toBeNull();
    expect(back!.entries.length).toBe(1);
    expect(back!.entries[0]!.id).toBe('keep');
  });

  test('parseImport rejects nonsense', () => {
    expect(parseImport('{not json')).toBeNull();
  });
});
