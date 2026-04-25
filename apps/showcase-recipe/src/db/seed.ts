/**
 * Seed the recipe database with five example recipes on first load.
 * No-op if the DB already has rows. Pure data only — runs against the
 * normal query helpers so it survives schema migrations.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { addIngredient, createRecipe, ensureSchema, listRecipes } from './queries.ts';

export interface SeedRecipe {
  title: string;
  notes: string;
  servings: number;
  cook_minutes: number;
  ingredients: Array<{ name: string; amount?: string; unit?: string; brand?: string }>;
}

export const SEED_RECIPES: SeedRecipe[] = [
  {
    title: 'Slow weekend pasta',
    notes:
      'Brown the soffritto patiently. The sugo wants forty minutes, not twenty. Fold the pasta in for the last sixty seconds.',
    servings: 4,
    cook_minutes: 75,
    ingredients: [
      { name: 'tomato', amount: '800', unit: 'g', brand: 'San Marzano' },
      { name: 'onion', amount: '1', unit: 'medium' },
      { name: 'garlic', amount: '3', unit: 'cloves' },
      { name: 'olive oil', amount: '3', unit: 'tbsp' },
      { name: 'pasta', amount: '400', unit: 'g' },
      { name: 'parmesan', amount: '40', unit: 'g' },
    ],
  },
  {
    title: 'Banana oat pancakes',
    notes: 'Blender. Three minutes prep, ten minutes cooking. Crowd-pleaser at zero effort.',
    servings: 2,
    cook_minutes: 12,
    ingredients: [
      { name: 'banana', amount: '2', unit: 'ripe' },
      { name: 'oats', amount: '120', unit: 'g' },
      { name: 'eggs', amount: '2' },
      { name: 'milk', amount: '120', unit: 'ml' },
      { name: 'baking powder', amount: '1', unit: 'tsp' },
    ],
  },
  {
    title: 'Tahini lemon dressing',
    notes: 'Use it on everything: salads, roasted veg, grain bowls. Keeps a week in the fridge.',
    servings: 8,
    cook_minutes: 5,
    ingredients: [
      { name: 'tahini', amount: '120', unit: 'g' },
      { name: 'lemon', amount: '2', unit: 'juiced' },
      { name: 'garlic', amount: '1', unit: 'clove' },
      { name: 'water', amount: '60', unit: 'ml' },
      { name: 'salt', amount: '1', unit: 'pinch' },
    ],
  },
  {
    title: 'Cold-soak overnight oats',
    notes: 'Mix at night. Eat at dawn. Top with whatever fruit is in the bowl.',
    servings: 1,
    cook_minutes: 0,
    ingredients: [
      { name: 'oats', amount: '60', unit: 'g' },
      { name: 'yogurt', amount: '120', unit: 'g' },
      { name: 'milk', amount: '60', unit: 'ml' },
      { name: 'chia seeds', amount: '1', unit: 'tbsp' },
      { name: 'maple syrup', amount: '1', unit: 'tsp' },
    ],
  },
  {
    title: 'Sheet-pan chicken & veg',
    notes: 'One tray, 35 minutes. Toss everything together with olive oil + smoked paprika first.',
    servings: 4,
    cook_minutes: 40,
    ingredients: [
      { name: 'chicken thighs', amount: '800', unit: 'g' },
      { name: 'potato', amount: '600', unit: 'g' },
      { name: 'red onion', amount: '2' },
      { name: 'olive oil', amount: '3', unit: 'tbsp' },
      { name: 'smoked paprika', amount: '2', unit: 'tsp' },
      { name: 'lemon', amount: '1', unit: 'wedged' },
    ],
  },
];

export async function seedIfEmpty(db: ShippieLocalDb): Promise<{ seeded: boolean; count: number }> {
  await ensureSchema(db);
  const existing = await listRecipes(db);
  if (existing.length > 0) return { seeded: false, count: existing.length };
  for (const recipe of SEED_RECIPES) {
    const created = await createRecipe(db, {
      title: recipe.title,
      notes: recipe.notes,
      servings: recipe.servings,
      cook_minutes: recipe.cook_minutes,
    });
    for (const ing of recipe.ingredients) {
      await addIngredient(db, {
        recipe_id: created.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        brand: ing.brand,
      });
    }
  }
  return { seeded: true, count: SEED_RECIPES.length };
}
