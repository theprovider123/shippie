/**
 * Recovery drill — exercises the full restore path on every PR.
 *
 * The user's first encounter with a backup is at the worst possible
 * moment: storage was wiped, panic is in the air, they need their
 * recipes back. So the only test that really matters is "if I export
 * and then wipe everything, can I get it back byte-for-byte." Anything
 * less leaves a backup format that's unverified at the boundary that
 * counts.
 */
import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import { addIngredient, createRecipe, getRecipe, listRecipes } from './queries.ts';
import { exportRecipeBackup, restoreRecipeBackup } from './backup.ts';
import { INGREDIENTS_TABLE, RECIPES_TABLE } from './schema.ts';
import type { Ingredient, Recipe, RecipeWithIngredients } from './schema.ts';
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';

describe('recipe backup recovery drill', () => {
  it('round-trips multiple recipes + ingredients deep-equal after a full wipe', async () => {
    const db = new MemoryLocalDb();

    const stew = await createRecipe(db, {
      title: 'Bean stew',
      notes: 'Low and slow.',
      servings: 4,
      cook_minutes: 90,
    });
    await addIngredient(db, { recipe_id: stew.id, name: 'beans', amount: '400', unit: 'g' });
    await addIngredient(db, {
      recipe_id: stew.id,
      name: 'tomato passata',
      amount: '500',
      unit: 'ml',
    });

    const cake = await createRecipe(db, {
      title: 'Olive oil cake',
      notes: null,
      servings: 8,
      cook_minutes: 45,
    });
    await addIngredient(db, { recipe_id: cake.id, name: 'olive oil', amount: '200', unit: 'ml' });
    await addIngredient(db, { recipe_id: cake.id, name: 'flour', amount: '250', unit: 'g' });

    const beforeMeta = stripVolatile(await fetchAll(db));

    const { blob, info } = await exportRecipeBackup(db, 'drill-passphrase');
    expect(info.recipeCount).toBe(2);
    expect(info.ingredientCount).toBe(4);

    // Wipe the OPFS-equivalent: delete every row in both tables. This
    // simulates what the user sees after Safari evicts site data, the
    // browser profile is reset, or quota pressure clears the vault.
    const ingredientRows = (await db.query(INGREDIENTS_TABLE)) as LocalDbRecord[];
    for (const row of ingredientRows) await db.delete(INGREDIENTS_TABLE, String(row.id));
    const recipeRows = (await db.query(RECIPES_TABLE)) as LocalDbRecord[];
    for (const row of recipeRows) await db.delete(RECIPES_TABLE, String(row.id));
    expect(await listRecipes(db)).toHaveLength(0);

    await restoreRecipeBackup(db, blob, 'drill-passphrase');

    expect(stripVolatile(await fetchAll(db))).toEqual(beforeMeta);
  });

  it('aborts cleanly on a wrong passphrase without touching existing rows', async () => {
    const source = new MemoryLocalDb();
    await createRecipe(source, { title: 'Source pasta' });
    const { blob } = await exportRecipeBackup(source, 'right');

    const target = new MemoryLocalDb();
    await createRecipe(target, { title: 'Target risotto' });

    await expect(restoreRecipeBackup(target, blob, 'wrong')).rejects.toThrow();
    const survivors = await listRecipes(target);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.title).toBe('Target risotto');
  });
});

async function fetchAll(db: ShippieLocalDb): Promise<RecipeWithIngredients[]> {
  const recipes = await listRecipes(db);
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  const result: RecipeWithIngredients[] = [];
  for (const recipe of sorted) {
    const full = await getRecipe(db, recipe.id);
    if (full) result.push(full);
  }
  return result;
}

interface ComparableRecipe extends Omit<Recipe, 'created_at' | 'updated_at'> {
  ingredients: Ingredient[];
}

/**
 * Drop volatile timestamps before comparing. Restored rows preserve the
 * id/title/quantity payload, but `created_at`/`updated_at` are written
 * by the runtime on insert — so they shift on restore, and asserting on
 * them would make the drill flaky without proving anything.
 */
function stripVolatile(recipes: RecipeWithIngredients[]): ComparableRecipe[] {
  return recipes.map(({ created_at: _c, updated_at: _u, ingredients, ...rest }) => ({
    ...rest,
    ingredients: [...ingredients].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
