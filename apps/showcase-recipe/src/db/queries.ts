/**
 * Query helpers around `shippie.local.db`. Everything is async because the
 * underlying engine is wa-sqlite + OPFS (off-main-thread). Helpers keep the
 * components free of SQL-shaped knowledge.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  INGREDIENTS_TABLE,
  RECIPES_TABLE,
  ingredientsSchema,
  recipesSchema,
  type Ingredient,
  type Recipe,
  type RecipeWithIngredients,
} from './schema.ts';

// LocalDbRecord uses an `unknown` index signature; our typed Recipe/Ingredient
// rows satisfy the underlying SQL shape but TypeScript doesn't see them as
// assignable. Cast at the boundary so the rest of the app stays well-typed.
type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

export interface DbHandle {
  db: ShippieLocalDb;
}

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(RECIPES_TABLE, recipesSchema);
      await db.create(INGREDIENTS_TABLE, ingredientsSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listRecipes(db: ShippieLocalDb): Promise<Recipe[]> {
  await ensureSchema(db);
  return db.query<RowOf<Recipe>>(RECIPES_TABLE, { orderBy: { updated_at: 'desc' } });
}

export async function getRecipe(db: ShippieLocalDb, id: string): Promise<RecipeWithIngredients | null> {
  await ensureSchema(db);
  const recipes = await db.query<RowOf<Recipe>>(RECIPES_TABLE, { where: { id }, limit: 1 });
  const recipe = recipes[0];
  if (!recipe) return null;
  const ingredients = await db.query<RowOf<Ingredient>>(INGREDIENTS_TABLE, {
    where: { recipe_id: id },
  });
  return { ...recipe, ingredients };
}

export async function createRecipe(
  db: ShippieLocalDb,
  input: Omit<Recipe, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<Recipe> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: input.id ?? newId(),
    title: input.title,
    notes: input.notes ?? null,
    servings: input.servings ?? null,
    cook_minutes: input.cook_minutes ?? null,
    created_at: now,
    updated_at: now,
  };
  await db.insert(RECIPES_TABLE, asRow(recipe));
  return recipe;
}

export async function updateRecipe(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Recipe, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Recipe>>(RECIPES_TABLE, id, asRow({ ...patch, updated_at: new Date().toISOString() }));
}

export async function deleteRecipe(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  const ingredients = await db.query<RowOf<Ingredient>>(INGREDIENTS_TABLE, { where: { recipe_id: id } });
  for (const ing of ingredients) await db.delete(INGREDIENTS_TABLE, ing.id);
  await db.delete(RECIPES_TABLE, id);
}

export async function addIngredient(
  db: ShippieLocalDb,
  input: Omit<Ingredient, 'id'> & { id?: string },
): Promise<Ingredient> {
  await ensureSchema(db);
  const ing: Ingredient = {
    id: input.id ?? newId(),
    recipe_id: input.recipe_id,
    name: input.name,
    amount: input.amount ?? null,
    unit: input.unit ?? null,
    barcode: input.barcode ?? null,
    brand: input.brand ?? null,
  };
  await db.insert(INGREDIENTS_TABLE, asRow(ing));
  return ing;
}

export async function deleteIngredient(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(INGREDIENTS_TABLE, id);
}

export async function searchRecipes(db: ShippieLocalDb, q: string): Promise<Recipe[]> {
  await ensureSchema(db);
  const trimmed = q.trim();
  if (!trimmed) return listRecipes(db);
  return db.search<RowOf<Recipe>>(RECIPES_TABLE, trimmed, { limit: 50 });
}

/**
 * Distinct ingredient names — feeds the autocomplete rule. Pure, deterministic,
 * sorted by frequency desc then alpha so "tomato" beats "tarragon" in suggestions.
 */
export async function distinctIngredientNames(db: ShippieLocalDb): Promise<string[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Ingredient>>(INGREDIENTS_TABLE, { limit: 1000 });
  return rankFrequencies(rows.map((r) => r.name).filter(Boolean));
}

export function rankFrequencies(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

export function filterSuggestions(query: string, candidates: string[], max = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, max);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const c of candidates) {
    const lc = c.toLowerCase();
    if (lc.startsWith(q)) starts.push(c);
    else if (lc.includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, max);
}
