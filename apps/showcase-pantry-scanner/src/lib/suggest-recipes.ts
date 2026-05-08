/**
 * Recipe suggestions — match a recipe library against the current
 * pantry. Two sources feed the library:
 *
 *   1. A small built-in list of pantry-staple recipes, scoped to the
 *      ingredients the user is most likely to have. This is the
 *      offline floor — every install gets at least these.
 *   2. Recipes ingested via the cross-app intent stream (`recipe-card`
 *      from Recipe Saver). Stored alongside `Item` rows in localStorage.
 *
 * Scoring: a recipe scores `matched / required`. Optional ingredients
 * are bonus, not penalty. We surface only recipes scoring ≥ MATCH_FLOOR
 * (default 0.66 — two thirds of required ingredients on hand).
 */
import type { Item } from './types.ts';
import { nameKey } from './storage.ts';

export interface RecipeIngredient {
  name: string;
  /** Required ingredients are scored; optional are bonus. */
  optional?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  /** One-line cooking-counter pitch. No emoji, no exclamation. */
  blurb: string;
  ingredients: ReadonlyArray<RecipeIngredient>;
  /** Source — `built-in` or the slug of the providing app. */
  source: 'built-in' | string;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  /** Required ingredients matched / required ingredients total. */
  score: number;
  /** Required ingredients on hand — by display name. */
  matched: string[];
  /** Required ingredients missing. */
  missing: string[];
  /** Optional ingredients on hand — bonus. */
  bonus: string[];
}

export interface SuggestOptions {
  /** Minimum score to surface. Default 0.66. */
  matchFloor?: number;
  /** Cap on the number of suggestions returned. Default 5. */
  limit?: number;
}

const DEFAULTS: Required<SuggestOptions> = {
  matchFloor: 0.66,
  limit: 5,
};

/**
 * Built-in pantry-staple recipes. These are intentionally minimal —
 * the goal is "you've got eggs, leek, butter, parmesan — make
 * carbonara" out of the box, not a recipe app.
 */
export const BUILTIN_RECIPES: readonly Recipe[] = [
  {
    id: 'builtin-carbonara',
    title: 'Carbonara',
    blurb: 'Eggs, cured pork, cheese, pasta. Done in 15.',
    source: 'built-in',
    ingredients: [
      { name: 'pasta' },
      { name: 'egg' },
      { name: 'parmesan' },
      { name: 'pancetta' },
      { name: 'pepper', optional: true },
    ],
  },
  {
    id: 'builtin-leek-soup',
    title: 'Leek and potato soup',
    blurb: 'One pot. Cream optional.',
    source: 'built-in',
    ingredients: [
      { name: 'leek' },
      { name: 'potato' },
      { name: 'butter' },
      { name: 'stock' },
      { name: 'cream', optional: true },
    ],
  },
  {
    id: 'builtin-fried-rice',
    title: 'Fried rice',
    blurb: 'Cold rice, eggs, soy. Whatever veg is dying.',
    source: 'built-in',
    ingredients: [
      { name: 'rice' },
      { name: 'egg' },
      { name: 'soy sauce' },
      { name: 'onion', optional: true },
      { name: 'garlic', optional: true },
    ],
  },
  {
    id: 'builtin-omelette',
    title: 'Omelette',
    blurb: 'Three eggs, butter, salt. Five minutes.',
    source: 'built-in',
    ingredients: [
      { name: 'egg' },
      { name: 'butter' },
      { name: 'cheese', optional: true },
    ],
  },
  {
    id: 'builtin-pasta-aglio',
    title: 'Pasta aglio e olio',
    blurb: 'Pasta, garlic, oil, chilli. Cupboard dinner.',
    source: 'built-in',
    ingredients: [
      { name: 'pasta' },
      { name: 'garlic' },
      { name: 'olive oil' },
      { name: 'chilli', optional: true },
    ],
  },
  {
    id: 'builtin-yoghurt-bowl',
    title: 'Yoghurt bowl',
    blurb: 'Yoghurt, oats, honey. Breakfast in two.',
    source: 'built-in',
    ingredients: [
      { name: 'yoghurt' },
      { name: 'oats' },
      { name: 'honey', optional: true },
      { name: 'fruit', optional: true },
    ],
  },
  {
    id: 'builtin-grilled-cheese',
    title: 'Grilled cheese',
    blurb: 'Bread, butter, cheese. Hot pan.',
    source: 'built-in',
    ingredients: [
      { name: 'bread' },
      { name: 'butter' },
      { name: 'cheese' },
    ],
  },
  {
    id: 'builtin-tomato-pasta',
    title: 'Tomato pasta',
    blurb: 'Pasta, tin tomatoes, garlic. Simmer 15.',
    source: 'built-in',
    ingredients: [
      { name: 'pasta' },
      { name: 'tomato' },
      { name: 'garlic' },
      { name: 'basil', optional: true },
    ],
  },
];

/**
 * Match an ingredient name against a set of pantry name-keys. The match
 * is "ingredient key is a substring of OR contained by the pantry key"
 * — handles "egg" matching "free-range eggs" without needing a stem
 * library.
 */
export function ingredientMatches(
  ingredientName: string,
  pantryKeys: ReadonlySet<string>,
): boolean {
  const ing = nameKey(ingredientName);
  if (!ing) return false;
  if (pantryKeys.has(ing)) return true;
  for (const key of pantryKeys) {
    if (key.includes(ing) || ing.includes(key)) return true;
  }
  return false;
}

export function scoreRecipe(
  recipe: Recipe,
  pantryKeys: ReadonlySet<string>,
): RecipeSuggestion {
  const required = recipe.ingredients.filter((i) => !i.optional);
  const optional = recipe.ingredients.filter((i) => i.optional);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const ing of required) {
    if (ingredientMatches(ing.name, pantryKeys)) matched.push(ing.name);
    else missing.push(ing.name);
  }
  const bonus: string[] = [];
  for (const ing of optional) {
    if (ingredientMatches(ing.name, pantryKeys)) bonus.push(ing.name);
  }

  const score = required.length === 0 ? 1 : matched.length / required.length;
  return { recipe, score, matched, missing, bonus };
}

export function suggestRecipes(
  items: readonly Item[],
  recipes: readonly Recipe[] = BUILTIN_RECIPES,
  options: SuggestOptions = {},
): RecipeSuggestion[] {
  const opts = { ...DEFAULTS, ...options };
  const pantryKeys = new Set(
    items.filter((it) => it.quantity > 0).map((it) => it.nameKey),
  );
  return recipes
    .map((r) => scoreRecipe(r, pantryKeys))
    .filter((s) => s.score >= opts.matchFloor)
    .sort((a, b) => {
      // Primary: score. Tie-break: more bonus ingredients > fewer.
      if (b.score !== a.score) return b.score - a.score;
      return b.bonus.length - a.bonus.length;
    })
    .slice(0, opts.limit);
}
