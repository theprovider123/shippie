import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import { addIngredient, createRecipe, getRecipe, listRecipes } from './queries.ts';
import { exportRecipeBackup, inspectRecipeBackup, restoreRecipeBackup } from './backup.ts';

describe('recipe backup', () => {
  it('exports and restores recipes with ingredients as one encrypted backup', async () => {
    const source = new MemoryLocalDb();
    const recipe = await createRecipe(source, {
      title: 'Test stew',
      notes: 'Low and slow',
      servings: 4,
      cook_minutes: 90,
    });
    await addIngredient(source, { recipe_id: recipe.id, name: 'beans', amount: '400', unit: 'g' });

    const { blob, info } = await exportRecipeBackup(source, 'secret');
    expect(info.recipeCount).toBe(1);
    expect(info.ingredientCount).toBe(1);

    const preview = await inspectRecipeBackup(blob, 'secret');
    expect(preview.info.recipeCount).toBe(1);

    const target = new MemoryLocalDb();
    await restoreRecipeBackup(target, blob, 'secret');
    const restored = await getRecipe(target, recipe.id);
    expect(restored?.title).toBe('Test stew');
    expect(restored?.ingredients[0]?.name).toBe('beans');
  });

  it('dry-runs restore without replacing current rows', async () => {
    const source = new MemoryLocalDb();
    await createRecipe(source, { title: 'Backup recipe' });
    const { blob } = await exportRecipeBackup(source, 'secret');

    const target = new MemoryLocalDb();
    await createRecipe(target, { title: 'Keep me' });
    const info = await restoreRecipeBackup(target, blob, 'secret', { dryRun: true });

    expect(info.recipeCount).toBe(1);
    expect(await listRecipes(target)).toHaveLength(1);
    expect((await listRecipes(target))[0]?.title).toBe('Keep me');
  });

  it('rejects the wrong passphrase', async () => {
    const db = new MemoryLocalDb();
    await createRecipe(db, { title: 'Pasta' });
    const { blob } = await exportRecipeBackup(db, 'correct');

    await expect(inspectRecipeBackup(blob, 'wrong')).rejects.toThrow();
  });
});
