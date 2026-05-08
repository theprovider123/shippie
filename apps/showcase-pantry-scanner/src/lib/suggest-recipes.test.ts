import { describe, expect, test } from 'bun:test';
import {
  BUILTIN_RECIPES,
  ingredientMatches,
  scoreRecipe,
  suggestRecipes,
  type Recipe,
} from './suggest-recipes.ts';
import type { Item } from './types.ts';

function fakeItem(name: string, qty = 1): Item {
  return {
    id: `i_${name}`,
    name,
    nameKey: name.toLowerCase(),
    quantity: qty,
    unit: 'ea',
    location: 'pantry',
    addedAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
  };
}

describe('ingredientMatches', () => {
  test('exact match', () => {
    expect(ingredientMatches('egg', new Set(['egg']))).toBe(true);
  });

  test('substring match (pantry name contains ingredient)', () => {
    expect(
      ingredientMatches('egg', new Set(['free range eggs'])),
    ).toBe(true);
  });

  test('empty ingredient never matches', () => {
    expect(ingredientMatches('', new Set(['eggs']))).toBe(false);
  });

  test('no match', () => {
    expect(ingredientMatches('saffron', new Set(['eggs', 'milk']))).toBe(
      false,
    );
  });
});

describe('scoreRecipe', () => {
  const recipe: Recipe = {
    id: 'test',
    title: 'Test',
    blurb: '',
    source: 'built-in',
    ingredients: [
      { name: 'egg' },
      { name: 'butter' },
      { name: 'cheese', optional: true },
    ],
  };

  test('full match → score 1', () => {
    const result = scoreRecipe(
      recipe,
      new Set(['egg', 'butter', 'cheese']),
    );
    expect(result.score).toBe(1);
    expect(result.matched).toEqual(['egg', 'butter']);
    expect(result.bonus).toEqual(['cheese']);
    expect(result.missing).toEqual([]);
  });

  test('partial match → fractional score', () => {
    const result = scoreRecipe(recipe, new Set(['egg']));
    expect(result.score).toBe(0.5);
    expect(result.missing).toEqual(['butter']);
  });

  test('optional ingredients do not penalise', () => {
    const result = scoreRecipe(
      recipe,
      new Set(['egg', 'butter']), // no cheese
    );
    expect(result.score).toBe(1);
    expect(result.bonus).toEqual([]);
  });
});

describe('suggestRecipes', () => {
  test('surfaces only recipes above the match floor', () => {
    const items = [fakeItem('egg'), fakeItem('butter')];
    const out = suggestRecipes(items);
    // omelette is 2/2 required, fully matched.
    expect(out.some((s) => s.recipe.id === 'builtin-omelette')).toBe(true);
    // carbonara needs pasta + parmesan + pancetta — won't make it.
    expect(out.some((s) => s.recipe.id === 'builtin-carbonara')).toBe(false);
  });

  test('respects the limit option', () => {
    const items = [
      fakeItem('egg'),
      fakeItem('butter'),
      fakeItem('pasta'),
      fakeItem('parmesan'),
      fakeItem('pancetta'),
      fakeItem('garlic'),
      fakeItem('olive oil'),
      fakeItem('bread'),
      fakeItem('cheese'),
    ];
    const out = suggestRecipes(items, BUILTIN_RECIPES, { limit: 2 });
    expect(out.length).toBeLessThanOrEqual(2);
  });

  test('ties broken by bonus ingredient count', () => {
    const recipes: Recipe[] = [
      {
        id: 'a',
        title: 'A',
        blurb: '',
        source: 'built-in',
        ingredients: [{ name: 'egg' }],
      },
      {
        id: 'b',
        title: 'B',
        blurb: '',
        source: 'built-in',
        ingredients: [{ name: 'egg' }, { name: 'cheese', optional: true }],
      },
    ];
    const items = [fakeItem('egg'), fakeItem('cheese')];
    const out = suggestRecipes(items, recipes);
    expect(out[0]!.recipe.id).toBe('b');
  });

  test('items with quantity 0 do not count as in-stock', () => {
    const items = [fakeItem('egg', 0), fakeItem('butter')];
    const out = suggestRecipes(items);
    // omelette needs egg + butter — egg is out, so it should drop.
    expect(out.some((s) => s.recipe.id === 'builtin-omelette')).toBe(false);
  });
});
