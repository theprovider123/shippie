import { describe, expect, test } from 'bun:test';
import { rankRecipes, type SuggestRecipe } from './suggest.ts';

const NOW = Date.UTC(2026, 5, 15, 18, 0); // a Monday evening
const DAY = 86_400_000;

function recipe(over: Partial<SuggestRecipe> & { id: string }): SuggestRecipe {
  return {
    title: over.title ?? over.id,
    category: 'Dinner',
    cuisine: 'Italian',
    prepTime: 10,
    cookTime: 20,
    ingredients: [],
    dietaryTags: [],
    personalFit: 60,
    ...over,
  };
}

function dateIn(days: number): string {
  return new Date(NOW + days * DAY).toISOString().slice(0, 10);
}

describe('rankRecipes — pantry feasibility', () => {
  test('a fully-stocked recipe outranks one with nothing on hand', () => {
    const stocked = recipe({ id: 'stocked', ingredients: [{ name: 'tomato' }, { name: 'basil' }] });
    const bare = recipe({ id: 'bare', ingredients: [{ name: 'octopus' }, { name: 'samphire' }] });
    const out = rankRecipes([bare, stocked], [{ name: 'tomato' }, { name: 'basil' }], [], new Set(), { now: NOW });
    expect(out[0]!.recipe.id).toBe('stocked');
    expect(out[0]!.have).toBe(2);
    expect(out[0]!.reason).toContain('everything');
  });

  test('staples (salt, oil) are assumed present and never block a match', () => {
    const r = recipe({ id: 'r', ingredients: [{ name: 'salt' }, { name: 'olive oil' }, { name: 'tomato' }] });
    const out = rankRecipes([r], [{ name: 'tomato' }], [], new Set(), { now: NOW });
    // only the tomato counts → 1/1 on hand, not 1/3
    expect(out[0]!.total).toBe(1);
    expect(out[0]!.pantryFraction).toBe(1);
  });
});

describe('rankRecipes — use-it-up (waste-first)', () => {
  test('a recipe using a soon-to-expire item is boosted with a reason', () => {
    const uses = recipe({ id: 'uses', ingredients: [{ name: 'fennel' }] });
    const ignores = recipe({ id: 'ignores', ingredients: [{ name: 'fennel' }] });
    const pantry = [{ name: 'fennel', expiresOn: dateIn(2) }];
    // both can use fennel, but only score the one whose pantry has it expiring
    const out = rankRecipes([uses], pantry, [], new Set(), { now: NOW });
    expect(out[0]!.reason).toContain('fennel');
    expect(out[0]!.reasons.some((r) => /turns/.test(r))).toBe(true);
    // vs the same recipe with a far-off expiry → lower score
    const calm = rankRecipes([ignores], [{ name: 'fennel', expiresOn: dateIn(40) }], [], new Set(), { now: NOW });
    expect(out[0]!.score).toBeGreaterThan(calm[0]!.score);
  });
});

describe('rankRecipes — variety', () => {
  test('a recipe cooked yesterday is down-ranked vs a fresh one', () => {
    const fresh = recipe({ id: 'fresh' });
    const justCooked = recipe({ id: 'just', personalFit: 60 });
    const out = rankRecipes(
      [fresh, justCooked],
      [],
      [{ recipeId: 'just', cookedAt: NOW - DAY }],
      new Set(),
      { now: NOW },
    );
    expect(out[0]!.recipe.id).toBe('fresh');
  });
});

describe('rankRecipes — dietary hard gate + skip', () => {
  test('avoided ingredients remove a recipe entirely', () => {
    const peanut = recipe({ id: 'peanut', ingredients: [{ name: 'peanut butter' }] });
    const safe = recipe({ id: 'safe', ingredients: [{ name: 'tomato' }] });
    const out = rankRecipes([peanut, safe], [], [], new Set(), { avoid: ['peanut'], now: NOW });
    expect(out.map((s) => s.recipe.id)).toEqual(['safe']);
  });

  test('skipped recipes are excluded', () => {
    const a = recipe({ id: 'a' });
    const b = recipe({ id: 'b' });
    const out = rankRecipes([a, b], [], [], new Set(), { now: NOW, skip: new Set(['a']) });
    expect(out.map((s) => s.recipe.id)).toEqual(['b']);
  });
});

describe('rankRecipes — cross-app signals (the Shippie moat)', () => {
  test('a low mood lifts comfort food above a light salad', () => {
    const stew = recipe({ id: 'stew', title: 'Butter Bean Stew' });
    const salad = recipe({ id: 'salad', title: 'Cucumber Salad', personalFit: 60 });
    const neutral = rankRecipes([stew, salad], [], [], new Set(), { now: NOW });
    const low = rankRecipes([stew, salad], [], [], new Set(), { now: NOW, signals: { mood: 'low' } });
    // the stew's lead grows under a low mood
    const lead = (o: ReturnType<typeof rankRecipes>) =>
      (o.find((s) => s.recipe.id === 'stew')!.score) - (o.find((s) => s.recipe.id === 'salad')!.score);
    expect(lead(low)).toBeGreaterThan(lead(neutral));
    expect(low[0]!.reasons.some((r) => /comfort/.test(r))).toBe(true);
  });

  test('a tight budget rewards cooking from the pantry', () => {
    const r = recipe({ id: 'r', ingredients: [{ name: 'tomato' }, { name: 'basil' }, { name: 'garlic' }] });
    const pantry = [{ name: 'tomato' }, { name: 'basil' }, { name: 'garlic' }];
    const normal = rankRecipes([r], pantry, [], new Set(), { now: NOW });
    const tight = rankRecipes([r], pantry, [], new Set(), { now: NOW, signals: { budgetTight: true } });
    expect(tight[0]!.score).toBeGreaterThan(normal[0]!.score);
    expect(tight[0]!.reasons.some((x) => /budget/.test(x))).toBe(true);
  });

  test('low hydration lifts lighter dishes', () => {
    const soup = recipe({ id: 'soup', title: 'Spring Greens Soup' });
    const neutral = rankRecipes([soup], [], [], new Set(), { now: NOW });
    const dry = rankRecipes([soup], [], [], new Set(), { now: NOW, signals: { hydrationLow: true } });
    expect(dry[0]!.score).toBeGreaterThan(neutral[0]!.score);
  });
});

describe('rankRecipes — favourites + planned', () => {
  test('planned-today wins and a favourite gets a nudge', () => {
    const planned = recipe({ id: 'planned' });
    const fav = recipe({ id: 'fav', favorited: true });
    const plain = recipe({ id: 'plain' });
    const out = rankRecipes([plain, fav, planned], [], [], new Set(), { now: NOW });
    expect(out[0]!.recipe.id).toBe('fav'); // no plan → the favourite nudge leads
    expect(out[0]!.reasons).toContain('a favourite');
    const withPlan = rankRecipes([plain, fav, planned], [], [], new Set(['planned']), { now: NOW });
    expect(withPlan[0]!.recipe.id).toBe('planned');
    expect(withPlan[0]!.reasons).toContain("on tonight's plan");
  });
});
