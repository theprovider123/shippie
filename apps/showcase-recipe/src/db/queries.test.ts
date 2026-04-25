import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addIngredient,
  createRecipe,
  deleteRecipe,
  distinctIngredientNames,
  filterSuggestions,
  getRecipe,
  listRecipes,
  rankFrequencies,
  searchRecipes,
  updateRecipe,
} from './queries.ts';

describe('rankFrequencies', () => {
  it('ranks by frequency desc then alphabetical', () => {
    const ranked = rankFrequencies(['Tomato', 'tomato', 'Onion', 'tomato', 'Onion', 'Garlic']);
    expect(ranked).toEqual(['tomato', 'onion', 'garlic']);
  });

  it('drops empty entries', () => {
    expect(rankFrequencies(['  ', '', 'salt'])).toEqual(['salt']);
  });
});

describe('filterSuggestions', () => {
  const candidates = ['tomato', 'tarragon', 'thyme', 'olive oil', 'oregano', 'salt'];

  it('returns top entries when query empty', () => {
    expect(filterSuggestions('', candidates, 3)).toEqual(['tomato', 'tarragon', 'thyme']);
  });

  it('prioritises starts-with over contains', () => {
    expect(filterSuggestions('o', candidates)).toEqual(['olive oil', 'oregano', 'tomato']);
  });

  it('caps results at max', () => {
    expect(filterSuggestions('', candidates, 2)).toHaveLength(2);
  });
});

describe('queries', () => {
  it('creates, lists, and updates a recipe', async () => {
    const db = new MemoryLocalDb();
    const recipe = await createRecipe(db, { title: 'Hello pasta' });
    expect(recipe.id).toBeTruthy();

    let all = await listRecipes(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Hello pasta');

    await updateRecipe(db, recipe.id, { title: 'Goodbye pasta' });
    all = await listRecipes(db);
    expect(all[0]!.title).toBe('Goodbye pasta');
  });

  it('cascades ingredient deletes when a recipe is deleted', async () => {
    const db = new MemoryLocalDb();
    const recipe = await createRecipe(db, { title: 'Soup' });
    await addIngredient(db, { recipe_id: recipe.id, name: 'water' });
    await addIngredient(db, { recipe_id: recipe.id, name: 'salt' });

    const loaded = await getRecipe(db, recipe.id);
    expect(loaded?.ingredients).toHaveLength(2);

    await deleteRecipe(db, recipe.id);
    const after = await getRecipe(db, recipe.id);
    expect(after).toBeNull();
    const ings = await db.query('ingredients');
    expect(ings).toHaveLength(0);
  });

  it('searches recipes by title substring', async () => {
    const db = new MemoryLocalDb();
    await createRecipe(db, { title: 'Slow weekend pasta' });
    await createRecipe(db, { title: 'Banana pancakes' });
    const results = await searchRecipes(db, 'pasta');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Slow weekend pasta');
  });

  it('returns distinct ingredient names ranked by frequency', async () => {
    const db = new MemoryLocalDb();
    const r1 = await createRecipe(db, { title: 'Pasta' });
    const r2 = await createRecipe(db, { title: 'Salad' });
    await addIngredient(db, { recipe_id: r1.id, name: 'tomato' });
    await addIngredient(db, { recipe_id: r1.id, name: 'olive oil' });
    await addIngredient(db, { recipe_id: r2.id, name: 'tomato' });
    await addIngredient(db, { recipe_id: r2.id, name: 'lettuce' });
    const names = await distinctIngredientNames(db);
    expect(names[0]).toBe('tomato');
    expect(names).toContain('olive oil');
    expect(names).toContain('lettuce');
  });
});
