import { decodeEncryptedBackup, encodeEncryptedBackup } from '@shippie/local-db';
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  INGREDIENTS_TABLE,
  RECIPES_TABLE,
  ingredientsSchema,
  recipesSchema,
  type Ingredient,
  type Recipe,
} from './schema.ts';
import { ensureSchema } from './queries.ts';

export const RECIPE_BACKUP_KIND = 'shippie.recipe-saver.backup.v1';

export interface RecipeBackupPlaintext {
  kind: typeof RECIPE_BACKUP_KIND;
  exportedAt: string;
  tables: {
    recipes: {
      schema: typeof recipesSchema;
      rows: Recipe[];
    };
    ingredients: {
      schema: typeof ingredientsSchema;
      rows: Ingredient[];
    };
  };
}

export interface RecipeBackupInfo {
  createdAt: string;
  encrypted: true;
  recipeCount: number;
  ingredientCount: number;
  contentHash?: string;
}

export async function exportRecipeBackup(
  db: ShippieLocalDb,
  passphrase: string,
): Promise<{ blob: Blob; info: RecipeBackupInfo }> {
  const trimmed = passphrase.trim();
  if (!trimmed) throw new Error('Enter a backup passphrase.');
  await ensureSchema(db);
  const recipes = (await db.query(RECIPES_TABLE)) as unknown as Recipe[];
  const ingredients = (await db.query(INGREDIENTS_TABLE)) as unknown as Ingredient[];
  const payload: RecipeBackupPlaintext = {
    kind: RECIPE_BACKUP_KIND,
    exportedAt: new Date().toISOString(),
    tables: {
      recipes: { schema: recipesSchema, rows: recipes },
      ingredients: { schema: ingredientsSchema, rows: ingredients },
    },
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = await encodeEncryptedBackup({
    appId: 'recipe-saver',
    schemaVersion: 1,
    tables: [RECIPES_TABLE, INGREDIENTS_TABLE],
    plaintext,
    passphrase: trimmed,
  });
  return {
    blob: encoded.blob,
    info: {
      createdAt: encoded.header.createdAt,
      encrypted: true,
      recipeCount: recipes.length,
      ingredientCount: ingredients.length,
      contentHash: encoded.header.contentHash,
    },
  };
}

export async function inspectRecipeBackup(
  file: Blob,
  passphrase: string,
): Promise<{ info: RecipeBackupInfo; payload: RecipeBackupPlaintext }> {
  const trimmed = passphrase.trim();
  if (!trimmed) throw new Error('Enter the backup passphrase.');
  const decoded = await decodeEncryptedBackup(file, trimmed);
  const payload = JSON.parse(new TextDecoder().decode(decoded.plaintext)) as RecipeBackupPlaintext;
  assertRecipeBackupPayload(payload);
  return {
    payload,
    info: {
      createdAt: decoded.header.createdAt,
      encrypted: true,
      recipeCount: payload.tables.recipes.rows.length,
      ingredientCount: payload.tables.ingredients.rows.length,
      contentHash: decoded.header.contentHash,
    },
  };
}

export async function restoreRecipeBackup(
  db: ShippieLocalDb,
  file: Blob,
  passphrase: string,
  opts: { dryRun?: boolean } = {},
): Promise<RecipeBackupInfo> {
  const { payload, info } = await inspectRecipeBackup(file, passphrase);
  if (opts.dryRun) return info;
  await ensureSchema(db);
  const existingIngredients = (await db.query(INGREDIENTS_TABLE)) as LocalDbRecord[];
  for (const row of existingIngredients) await db.delete(INGREDIENTS_TABLE, String(row.id));
  const existingRecipes = (await db.query(RECIPES_TABLE)) as LocalDbRecord[];
  for (const row of existingRecipes) await db.delete(RECIPES_TABLE, String(row.id));
  for (const recipe of payload.tables.recipes.rows) {
    await db.insert(RECIPES_TABLE, recipe as unknown as LocalDbRecord);
  }
  for (const ingredient of payload.tables.ingredients.rows) {
    await db.insert(INGREDIENTS_TABLE, ingredient as unknown as LocalDbRecord);
  }
  return info;
}

function assertRecipeBackupPayload(value: RecipeBackupPlaintext): void {
  if (!value || value.kind !== RECIPE_BACKUP_KIND) {
    throw new Error('This is not a Recipe Saver backup.');
  }
  if (!Array.isArray(value.tables?.recipes?.rows) || !Array.isArray(value.tables?.ingredients?.rows)) {
    throw new Error('Recipe backup is missing table rows.');
  }
  for (const recipe of value.tables.recipes.rows) {
    if (typeof recipe.id !== 'string' || typeof recipe.title !== 'string') {
      throw new Error('Recipe backup contains an invalid recipe row.');
    }
  }
  for (const ingredient of value.tables.ingredients.rows) {
    if (
      typeof ingredient.id !== 'string' ||
      typeof ingredient.recipe_id !== 'string' ||
      typeof ingredient.name !== 'string'
    ) {
      throw new Error('Recipe backup contains an invalid ingredient row.');
    }
  }
}
