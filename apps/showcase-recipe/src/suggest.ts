/**
 * "What can I cook tonight?" — the ranking brain.
 *
 * Pure + deterministic so it's testable and runs fully on-device. It layers the
 * signals research says actually matter: pantry feasibility, use-it-up
 * (expiry-first, so suggestions fight waste), variety (don't repeat last
 * night), time-of-day fit, and dietary hard-gates — PLUS the thing no cloud
 * recipe app can do: cross-app Shippie signals (a low mood nudges comfort food,
 * a tight budget favours cooking from the pantry, low hydration lifts lighter
 * dishes). Every top pick carries a plain-English `reason` so the suggestion is
 * trustworthy, not a black box.
 */

export interface SuggestRecipe {
  id: string;
  title: string;
  category: string;
  cuisine: string;
  prepTime: number;
  cookTime: number;
  ingredients: Array<{ name: string }>;
  dietaryTags: string[];
  personalFit: number;
  favorited?: boolean;
}

export interface SuggestPantryItem {
  name: string;
  expiresOn?: string;
}

export interface SuggestCooked {
  recipeId: string;
  cookedAt: number;
}

/** Latest cross-app signals captured from consumed Shippie intents. */
export interface KitchenSignals {
  /** mood-logged → 'low' nudges comfort, 'good' is neutral. */
  mood?: 'low' | 'ok' | 'good';
  /** budget-limit → near/over the cap favours cooking from the pantry. */
  budgetTight?: boolean;
  /** hydration-logged → behind on water lifts lighter, fresher dishes. */
  hydrationLow?: boolean;
}

export interface SuggestOptions {
  /** Ingredient/tag keywords the cook is avoiding (allergies, dislikes). */
  avoid?: string[];
  /** Recipe ids skipped in this session. */
  skip?: Set<string>;
  signals?: KitchenSignals;
  /** Injected for tests; defaults to Date.now(). */
  now?: number;
}

export interface Suggestion<R extends SuggestRecipe> {
  recipe: R;
  score: number;
  have: number;
  total: number;
  pantryFraction: number;
  /** The single best human reason this is tonight's pick. */
  reason: string;
  /** All contributing reasons, strongest first (for a details view). */
  reasons: string[];
}

const COMFORT_RE = /stew|bake|pasta|mac|cheese|curry|roast|pie|chocolate|risotto|gratin|dumpling|noodle|hearty|comfort|chilli|chili|lasagne|lasagna|cobbler|crumble/i;
const LIGHT_RE = /salad|soup|broth|fresh|citrus|cucumber|herb|light|poke|ceviche|smoothie|wrap|greens|steam|grain bowl|bowl/i;
// Assumed-present staples never block a "you can make this" match.
const STAPLES = /\b(salt|pepper|oil|olive oil|water|butter|sugar|flour|stock|seasoning)\b/i;

const DAY = 86_400_000;

function daysUntil(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso + 'T00:00:00').getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / DAY);
}

function isComfort(r: SuggestRecipe): boolean {
  const hay = `${r.title} ${r.dietaryTags.join(' ')} ${r.category}`;
  return COMFORT_RE.test(hay);
}
function isLight(r: SuggestRecipe): boolean {
  const hay = `${r.title} ${r.dietaryTags.join(' ')} ${r.category}`;
  return LIGHT_RE.test(hay);
}

/**
 * Rank recipes for "tonight". Returns every eligible recipe scored, sorted
 * best-first, each with a human reason. Dietary avoids are a hard gate (removed,
 * not down-ranked). Staples are assumed present so a match isn't blocked by salt.
 */
export function rankRecipes<R extends SuggestRecipe>(
  recipes: R[],
  pantry: SuggestPantryItem[],
  cooked: SuggestCooked[],
  plannedTodayIds: Set<string>,
  opts: SuggestOptions = {},
): Array<Suggestion<R>> {
  const now = opts.now ?? Date.now();
  const skip = opts.skip ?? new Set<string>();
  const avoid = (opts.avoid ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
  const signals = opts.signals ?? {};

  const hour = new Date(now).getHours();
  const preferred = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : 'Dinner';

  const pantryByName = new Map<string, SuggestPantryItem>();
  for (const item of pantry) pantryByName.set(item.name.toLowerCase(), item);

  // Soonest-expiring pantry name → days left (≤ 4 days counts as "use it up").
  const expiringSoon = new Map<string, number>();
  for (const item of pantry) {
    const d = daysUntil(item.expiresOn, now);
    if (d !== null && d <= 4) expiringSoon.set(item.name.toLowerCase(), d);
  }

  // Last-cooked timestamp per recipe (for the variety penalty).
  const lastCooked = new Map<string, number>();
  for (const c of cooked) {
    const prev = lastCooked.get(c.recipeId) ?? 0;
    if (c.cookedAt > prev) lastCooked.set(c.recipeId, c.cookedAt);
  }

  const out: Array<Suggestion<R>> = [];

  for (const recipe of recipes) {
    if (skip.has(recipe.id)) continue;

    // Dietary / dislike hard gate.
    if (avoid.length > 0) {
      const hay = `${recipe.title} ${recipe.ingredients.map((i) => i.name).join(' ')} ${recipe.dietaryTags.join(' ')}`.toLowerCase();
      if (avoid.some((a) => hay.includes(a))) continue;
    }

    const nonStaple = recipe.ingredients.filter((ing) => !STAPLES.test(ing.name));
    const total = nonStaple.length || recipe.ingredients.length;
    const have = nonStaple.filter((ing) => pantryByName.has(ing.name.toLowerCase())).length;
    const pantryFraction = total > 0 ? have / total : 1;

    const reasons: string[] = [];
    let score = recipe.personalFit;

    // Planned for today wins.
    if (plannedTodayIds.has(recipe.id)) {
      score += 80;
      reasons.push("on tonight's plan");
    }

    // Pantry feasibility (0–40).
    const pantryBoost = Math.round(pantryFraction * 40);
    score += pantryBoost;

    // Use-it-up: reward consuming soon-to-expire pantry items. This reason
    // leads over "you have everything" — fighting waste is the differentiator.
    const usesExpiring = recipe.ingredients
      .map((ing) => ing.name.toLowerCase())
      .filter((n) => expiringSoon.has(n));
    if (usesExpiring.length > 0) {
      const soonest = Math.min(...usesExpiring.map((n) => expiringSoon.get(n) ?? 99));
      score += Math.min(30, 12 + usesExpiring.length * 8);
      const item = usesExpiring[0];
      reasons.push(
        soonest <= 0 ? `uses your ${item} today before it turns` : `uses your ${item} before it turns`,
      );
    }

    if (pantryFraction >= 0.99) reasons.push('you have everything');
    else if (have > 0) reasons.push(`${have} of ${total} on hand`);

    // Time-of-day fit.
    if (recipe.category === preferred) {
      score += 12;
    }

    // Variety: down-rank anything cooked in the last 3 days.
    const last = lastCooked.get(recipe.id);
    if (last && now - last < 3 * DAY) {
      score -= 45;
    }

    // Favourite nudge.
    if (recipe.favorited) {
      score += 18;
      reasons.push('a favourite');
    }

    // ── Cross-app Shippie signals — the part no cloud app can do ──
    if (signals.mood === 'low' && isComfort(recipe)) {
      score += 22;
      reasons.unshift('comfort for a low day');
    }
    if (signals.budgetTight) {
      // Reward cooking from what you already own when money's tight.
      score += Math.round(pantryFraction * 25);
      if (pantryFraction >= 0.6) reasons.unshift('kind to your budget — mostly from your pantry');
    }
    if (signals.hydrationLow && isLight(recipe)) {
      score += 16;
      reasons.unshift('light + hydrating');
    }

    const totalTime = recipe.prepTime + recipe.cookTime;
    const reason = reasons[0] ?? (totalTime > 0 ? `ready in about ${totalTime} min` : 'a solid pick tonight');

    out.push({ recipe, score, have, total, pantryFraction, reason, reasons });
  }

  return out.sort((a, b) => b.score - a.score);
}
