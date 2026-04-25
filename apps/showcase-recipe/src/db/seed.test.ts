import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import { SEED_RECIPES, seedIfEmpty } from './seed.ts';
import { listRecipes } from './queries.ts';

describe('seedIfEmpty', () => {
  it('seeds five recipes on a fresh DB', async () => {
    const db = new MemoryLocalDb();
    const result = await seedIfEmpty(db);
    expect(result.seeded).toBe(true);
    expect(result.count).toBe(SEED_RECIPES.length);
    const recipes = await listRecipes(db);
    expect(recipes).toHaveLength(SEED_RECIPES.length);
  });

  it('is idempotent — does not seed if rows exist', async () => {
    const db = new MemoryLocalDb();
    await seedIfEmpty(db);
    const second = await seedIfEmpty(db);
    expect(second.seeded).toBe(false);
    const recipes = await listRecipes(db);
    expect(recipes).toHaveLength(SEED_RECIPES.length);
  });
});
