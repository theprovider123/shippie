/**
 * Mise — food search and free-text parsing.
 *
 * Two jobs, both about removing taps:
 *   1. searchFoods — forgiving fuzzy match over the seed DB + custom foods.
 *   2. parseFreeText — turn "2 eggs", "200g chicken", "handful of almonds",
 *      "large bowl of oatmeal" into a concrete {food, qty, grams} candidate.
 *
 * Everything is pure and deterministic so it's trivially testable.
 */
import type { Food } from './foods-data';
import type { Slot } from './types';
import { SLOTS } from './foods-data';

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function wordStartsWith(name: string, q: string): boolean {
  return name.split(/[\s,()-]+/).some((w) => w.startsWith(q));
}

function isSubsequence(q: string, name: string): boolean {
  let i = 0;
  for (const ch of name) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

/** Singular/plural variants of a query so "eggs"/"oats" find singular names. */
function queryVariants(q: string): string[] {
  const out = new Set<string>([q]);
  if (q.endsWith('ies') && q.length > 4) out.add(`${q.slice(0, -3)}y`);
  if (q.endsWith('es') && q.length > 3) out.add(q.slice(0, -2));
  if (q.endsWith('s') && q.length > 2) out.add(q.slice(0, -1));
  return [...out];
}

function scoreOnce(q: string, name: string, tags: readonly string[]): number {
  let score = 0;
  if (name === q) score = 1000;
  else if (name.startsWith(q)) score = 820 - name.length;
  else if (wordStartsWith(name, q)) score = 640;
  else {
    const idx = name.indexOf(q);
    if (idx >= 0) score = 460 - idx;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (score === 0 && tokens.length > 1) {
    const allIn = tokens.every((t) => name.includes(t) || tags.some((tg) => tg.includes(t)));
    if (allIn) score = 220 + tokens.length;
  }
  if (score === 0) {
    if (tags.some((tg) => tg === q)) score = 300;
    else if (tags.some((tg) => tg.includes(q))) score = 180;
  }
  if (score === 0 && isSubsequence(q, name)) score = 90;
  return score;
}

/** Relevance score for a single food against a normalised query. 0 = no match. */
export function scoreFood(queryRaw: string, food: Food): number {
  const q = norm(queryRaw);
  if (!q) return 0;
  const name = norm(food.name);
  const tags = (food.tags ?? []).map(norm);

  let best = 0;
  for (const v of queryVariants(q)) best = Math.max(best, scoreOnce(v, name, tags));
  if (best > 0 && food.favorite) best += 40;
  return best;
}

/** Ranked search over a food list. Empty query returns []. */
export function searchFoods(query: string, foods: readonly Food[], limit = 25): Food[] {
  if (!norm(query)) return [];
  const scored: Array<{ f: Food; s: number }> = [];
  for (const f of foods) {
    const s = scoreFood(query, f);
    if (s > 0) scored.push({ f, s });
  }
  scored.sort(
    (a, b) => b.s - a.s || a.f.name.length - b.f.name.length || a.f.name.localeCompare(b.f.name),
  );
  return scored.slice(0, limit).map((x) => x.f);
}

// ── Free-text parsing ────────────────────────────────────────────

/** Count words → multiplier. */
export const COUNT_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half: 0.5,
  quarter: 0.25,
  couple: 2,
  few: 3,
  several: 3,
};

/** Size words → serving multiplier. */
export const SIZE_WORDS: Record<string, number> = {
  tiny: 0.5,
  small: 0.7,
  little: 0.7,
  medium: 1,
  regular: 1,
  large: 1.4,
  big: 1.4,
  huge: 1.8,
  giant: 1.8,
};

/** Portion nouns → approximate grams (used when no explicit weight given). */
export const PORTION_WORDS: Record<string, number> = {
  handful: 30,
  pinch: 5,
  palm: 100,
  fist: 150,
  cup: 150,
  bowl: 250,
  plate: 350,
  slice: 30,
  piece: 50,
  scoop: 30,
  spoon: 15,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  glass: 250,
  mug: 240,
  can: 355,
  bottle: 500,
  shot: 30,
};

const SLOT_WORDS: Record<string, Slot> = {
  breakfast: 'breakfast',
  brekkie: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  supper: 'dinner',
  snack: 'snack',
  drink: 'drink',
  beverage: 'drink',
};

export interface ParsedFood {
  /** Best food match, or null when nothing matched the residual text. */
  food: Food | null;
  /** Display name (matched food name, or the cleaned residual text). */
  name: string;
  /** Servings of the matched food. */
  qty: number;
  /** Resolved grams. */
  grams: number;
  /** Slot hinted by the text, if any. */
  slotHint?: Slot;
  /** True when an explicit weight/portion was found (vs. a default guess). */
  explicit: boolean;
}

/**
 * Parse a free-text phrase into a loggable candidate. Best-effort and
 * forgiving: anything it can't resolve falls back to one default serving
 * (or 100 g if there's no food match), so the user can still log and fix.
 */
export function parseFreeText(textRaw: string, foods: readonly Food[]): ParsedFood {
  const text = norm(textRaw).replace(/\bof\b/g, ' ');
  const tokens = text.split(/\s+/).filter(Boolean);

  let count: number | null = null;
  let sizeMult = 1;
  let portionGrams: number | null = null;
  let explicitGrams: number | null = null;
  let slotHint: Slot | undefined;
  const residual: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === undefined) continue;

    // Explicit weight, e.g. "200g", "200 g", "250ml".
    const gm = /^(\d+(?:\.\d+)?)(g|gram|grams|ml|milliliter|milliliters)?$/.exec(t);
    if (gm) {
      const n = parseFloat(gm[1] ?? '0');
      const unit = gm[2];
      if (unit && /^(g|gram|grams|ml|milliliter|milliliters)$/.test(unit)) {
        explicitGrams = (explicitGrams ?? 0) + n;
      } else if (!unit) {
        // bare number → next token might be a unit ("200 g") or a count
        const next = tokens[i + 1];
        if (next && /^(g|grams?|ml|milliliters?)$/.test(next)) {
          explicitGrams = (explicitGrams ?? 0) + n;
          i++; // consume unit
        } else {
          count = (count ?? 0) + n;
        }
      }
      continue;
    }

    const cw = COUNT_WORDS[t];
    if (cw !== undefined) {
      count = (count ?? 0) + cw;
      continue;
    }
    const sw = SIZE_WORDS[t];
    if (sw !== undefined) {
      sizeMult *= sw;
      continue;
    }
    const pw = PORTION_WORDS[t];
    if (pw !== undefined) {
      portionGrams = (portionGrams ?? 0) + pw;
      continue;
    }
    const slw = SLOT_WORDS[t];
    if (slw !== undefined) {
      slotHint = slw;
      continue;
    }
    residual.push(t);
  }

  const query = residual.join(' ').trim();
  const food = query ? (searchFoods(query, foods, 1)[0] ?? null) : null;
  const servingGrams = food?.serving.grams ?? 100;

  let grams: number;
  let explicit = false;
  if (explicitGrams != null) {
    grams = explicitGrams;
    explicit = true;
  } else if (portionGrams != null) {
    grams = portionGrams * (count ?? 1) * sizeMult;
    explicit = true;
  } else {
    grams = servingGrams * (count ?? 1) * sizeMult;
    explicit = count != null || sizeMult !== 1;
  }

  const qty = servingGrams > 0 ? grams / servingGrams : count ?? 1;
  const name = food?.name ?? (query || textRaw.trim());

  const out: ParsedFood = {
    food,
    name,
    qty: Math.round(qty * 100) / 100,
    grams: Math.round(grams),
    explicit,
  };
  if (slotHint) out.slotHint = slotHint;
  return out;
}

/** Heuristic default slot from the local hour, for one-tap logging. */
export function slotForHour(hour: number): Slot {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export { SLOTS };
