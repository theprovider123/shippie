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

/**
 * Save the encrypted backup blob using the platform's most useful path.
 *
 * On iOS Safari and other Web Share-capable browsers, we route through
 * `navigator.share({ files: [...] })` so the user lands directly in the
 * native Files / iCloud Drive picker. iOS cannot silently re-write the
 * same file later — that's why this lives outside the cloud-style
 * BackupProviderApi: there is no `list` or `download` to symmetrise.
 *
 * Everywhere else we fall back to a same-origin anchor download.
 *
 * Returns the route taken so the caller can show appropriate copy.
 */
export async function saveBackupBlob(
  blob: Blob,
  filename: string,
): Promise<{ via: 'share' | 'download' }> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { via: 'share' };
      }
    } catch (err) {
      // AbortError fires when the user cancels the share sheet — surface
      // it so the caller doesn't claim the backup succeeded.
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // Any other share-sheet failure (Permission, NotAllowed, etc.) falls
      // through to the anchor-download fallback below.
    }
  }
  if (typeof URL === 'undefined' || typeof document === 'undefined') {
    throw new Error('No supported way to save the backup file in this environment.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { via: 'download' };
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
