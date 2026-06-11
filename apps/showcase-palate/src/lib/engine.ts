// palate. — pure engine functions (no side effects, fully testable)

import type { Timer, Formula, FormulaIngredient } from './types.ts';

// ─── Timer remaining ───────────────────────────────────────────

/**
 * Compute remaining seconds for a timer at `now` (epoch ms).
 * - idle: duration_s
 * - running: duration_s − elapsed (elapsed = wall-clock since start + pre-pause)
 * - paused: what was left when paused
 * - done: 0
 */
export function remainingSeconds(timer: Timer, now: number): number {
  if (timer.status === 'done') return 0;
  if (timer.status === 'idle') return timer.duration_s;
  if (timer.status === 'paused') {
    // Elapsed before pause is stored; remaining = duration − elapsed
    const elapsed = timer.elapsed_before_pause_s ?? 0;
    return Math.max(0, timer.duration_s - elapsed);
  }
  // running
  if (timer.started_at == null) return timer.duration_s;
  const wallElapsed = (now - timer.started_at) / 1000;
  const totalElapsed = wallElapsed + (timer.elapsed_before_pause_s ?? 0);
  return Math.max(0, timer.duration_s - totalElapsed);
}

// ─── Q10 fermentation ─────────────────────────────────────────

/**
 * Q10-adjusted remaining fermentation time.
 * rate = Q10^((dough_temp_c − ref) / 10)
 * Warmer dough ferments faster → rate > 1 → less time remaining.
 *
 * remaining = (target_s − elapsed_s * rate)
 * Clamped to [0, target_s].
 */
export function q10Remaining(
  target_s: number,
  elapsed_s: number,
  dough_temp_c: number,
  ref = 24,
  q10 = 2,
): number {
  const rate = Math.pow(q10, (dough_temp_c - ref) / 10);
  const adjusted = target_s - elapsed_s * rate;
  return Math.max(0, Math.min(target_s, adjusted));
}

// ─── Baker's formula scaling ──────────────────────────────────

export interface ScaledFormula {
  rows: Array<{ id: string; name: string; bakers_pct: number; grams: number; is_prefermented: boolean }>;
  trueHydration: number;   // percentage
  prefermentedPct: number; // percentage of total flour that is prefermented
  saltPct: number;
  saltInRange: boolean;    // salt ≤ 2.5%
  flourMass: number;       // total flour grams
}

/**
 * Scale a formula to `total_g` total dough weight.
 * Baker's percentages are relative to total flour weight.
 * Flour rows (not prefermented, non-water, non-salt) sum to 100%.
 */
export function scaleFormula(formula: Formula, total_g: number): ScaledFormula {
  const ingredients = formula.ingredients.slice().sort((a, b) => a.sort_order - b.sort_order);

  // Flour rows: any ingredient whose name contains "flour" or "wheat" or "wholemeal" or "rye"
  // or which is NOT water/salt/levain/preferment. But the canonical approach for baker's %:
  // total baker's% sum = 100% (flour) + water% + levain% + salt% + etc.
  // flourMass = total_g * flourPct / totalPct where flourPct = sum of non-water/salt flour rows
  // We detect flour rows heuristically: not prefermented, and bakers_pct contributes to flour sum.
  // Simplest: sum ALL ingredient bakers_pct to get the denominator.
  const totalPct = ingredients.reduce((s, i) => s + i.bakers_pct, 0);

  // Flour mass = total_g × (flour_pct / total_pct)
  // where flour_pct is the sum of pure flour rows (not water/levain/salt)
  const flourRows = ingredients.filter(
    (i) => !i.is_prefermented && !isWater(i.name) && !isSalt(i.name),
  );
  const flourPct = flourRows.reduce((s, i) => s + i.bakers_pct, 0);
  const flourMass = total_g * (flourPct / totalPct);

  const rows = ingredients.map((ing) => ({
    id: ing.id,
    name: ing.name,
    bakers_pct: ing.bakers_pct,
    grams: (ing.bakers_pct / flourPct) * flourMass,
    is_prefermented: ing.is_prefermented ?? false,
  }));

  // True hydration: total water / total flour
  // Water in levain: levain_grams * (hydration_pct / (100 + hydration_pct))
  const totalWaterG = ingredients.reduce((sum, ing) => {
    if (isWater(ing.name) && !ing.is_prefermented) {
      return sum + (ing.bakers_pct / flourPct) * flourMass;
    }
    if (ing.is_prefermented && ing.hydration_pct != null) {
      const levainG = (ing.bakers_pct / flourPct) * flourMass;
      // levain water = levainG × hydration / (100 + hydration)
      return sum + levainG * (ing.hydration_pct / (100 + ing.hydration_pct));
    }
    return sum;
  }, 0);
  // Prefermented flour, needed for the true totals below.
  const prefermentedFlourG = ingredients.reduce((sum, ing) => {
    if (ing.is_prefermented && ing.hydration_pct != null) {
      const levainG = (ing.bakers_pct / flourPct) * flourMass;
      // levain flour = levainG / (1 + hydration/100)
      return sum + levainG / (1 + ing.hydration_pct / 100);
    }
    return sum;
  }, 0);

  // Both stats are conventionally on the TOTAL flour basis (formula flour +
  // flour hiding inside the preferment) — that's what makes 20% levain at
  // 100% hydration read as "prefermented 9.1%", not 10%.
  const totalFlourG = flourMass + prefermentedFlourG;
  const trueHydration = (totalWaterG / totalFlourG) * 100;
  const prefermentedPct = (prefermentedFlourG / totalFlourG) * 100;

  const saltIng = ingredients.find((i) => isSalt(i.name));
  const saltPct = saltIng ? saltIng.bakers_pct : 0;
  const saltInRange = saltPct <= 2.5;

  return { rows, trueHydration, prefermentedPct, saltPct, saltInRange, flourMass };
}

function isWater(name: string): boolean {
  return /water/i.test(name);
}
function isSalt(name: string): boolean {
  return /salt/i.test(name);
}

// ─── DDT water temperature ───────────────────────────────────

/**
 * Desired Dough Temperature water calculation.
 * waterTemp = ddt × 3 − room − flour − friction
 * friction defaults: 25 for spiral, 28 for hand
 */
export function ddtWaterTemp(ddt: number, room: number, flour: number, friction = 25): number {
  return ddt * 3 - room - flour - friction;
}

// ─── Probe state ─────────────────────────────────────────────

export type ProbeState = 'tracking' | 'nearly' | 'pull';

/**
 * Determine probe state based on current temp vs pull temp.
 * nearly: within 3° of pull
 * pull: at or above pull temp
 */
export function probeState(current_c: number, pull_c: number): ProbeState {
  const delta = pull_c - current_c;
  if (delta <= 0) return 'pull';
  if (delta <= 3) return 'nearly';
  return 'tracking';
}

export function cToF(c: number): number {
  return c * 9 / 5 + 32;
}

export function fToC(f: number): number {
  return (f - 32) * 5 / 9;
}

// ─── Egg preset ──────────────────────────────────────────────

/**
 * Egg boil time in seconds.
 * base_s: base time for medium egg at room temp
 * large: +30s
 * fromFridge: +30s
 */
export function eggPreset(base_s: number, large: boolean, fromFridge: boolean): number {
  return base_s + (large ? 30 : 0) + (fromFridge ? 30 : 0);
}

export const EGG_PRESETS = [
  { label: 'soft', base_s: 6 * 60, displayBase: '6:00' },
  { label: 'jammy', base_s: 7 * 60 + 30, displayBase: '7:30' },
  { label: 'medium', base_s: 9 * 60, displayBase: '9:00' },
  { label: 'hard', base_s: 11 * 60, displayBase: '11:00' },
];

// ─── Conversions ─────────────────────────────────────────────

export interface ConversionEntry {
  ingredient: string;
  grams_per_cup: number;
}

export const VOLUME_TO_GRAMS: ConversionEntry[] = [
  { ingredient: 'Bread flour', grams_per_cup: 120 },
  { ingredient: 'Plain flour', grams_per_cup: 120 },
  { ingredient: 'Wholemeal flour', grams_per_cup: 130 },
  { ingredient: 'Butter', grams_per_cup: 227 },
  { ingredient: 'Honey', grams_per_cup: 340 },
  { ingredient: 'Sugar (white)', grams_per_cup: 200 },
  { ingredient: 'Brown sugar', grams_per_cup: 220 },
  { ingredient: 'Oats', grams_per_cup: 90 },
  { ingredient: 'Cocoa powder', grams_per_cup: 85 },
  { ingredient: 'Oil (neutral)', grams_per_cup: 218 },
  { ingredient: 'Milk', grams_per_cup: 245 },
  { ingredient: 'Water', grams_per_cup: 240 },
  { ingredient: 'Salt (fine)', grams_per_cup: 288 },
  { ingredient: 'Baking powder', grams_per_cup: 192 },
];

export interface OvenConversion {
  celsius: number;
  fan: number;
  fahrenheit: number;
  gas: number;
}

export const OVEN_MAP: OvenConversion[] = [
  { celsius: 140, fan: 120, fahrenheit: 284, gas: 1 },
  { celsius: 150, fan: 130, fahrenheit: 302, gas: 2 },
  { celsius: 160, fan: 140, fahrenheit: 320, gas: 3 },
  { celsius: 170, fan: 150, fahrenheit: 338, gas: 3 },
  { celsius: 180, fan: 160, fahrenheit: 356, gas: 4 },
  { celsius: 190, fan: 170, fahrenheit: 374, gas: 5 },
  { celsius: 200, fan: 180, fahrenheit: 392, gas: 6 },
  { celsius: 210, fan: 190, fahrenheit: 410, gas: 6 },
  { celsius: 220, fan: 200, fahrenheit: 428, gas: 7 },
  { celsius: 230, fan: 210, fahrenheit: 446, gas: 8 },
  { celsius: 240, fan: 220, fahrenheit: 464, gas: 9 },
  { celsius: 250, fan: 230, fahrenheit: 482, gas: 9 },
];

export interface Substitution {
  ingredient: string;
  substitute: string;
  notes?: string;
}

export const SUBSTITUTIONS: Substitution[] = [
  { ingredient: 'Buttermilk (240ml)', substitute: 'Milk + 1 tbsp white vinegar or lemon juice', notes: 'Let stand 5 min' },
  { ingredient: 'Egg (1 large)', substitute: 'Flax egg (1 tbsp ground flax + 3 tbsp water)', notes: 'Rest 5 min to gel' },
  { ingredient: 'Egg (1 large)', substitute: 'Unsweetened applesauce (60g)', notes: 'Adds moisture, lighter bind' },
  { ingredient: 'Bread flour', substitute: 'Plain flour + ½ tsp vital wheat gluten per 100g' },
  { ingredient: 'Cake flour', substitute: 'Plain flour − 2 tbsp per cup + 2 tbsp cornflour' },
  { ingredient: 'Brown sugar (100g)', substitute: 'White sugar 95g + molasses 5g' },
  { ingredient: 'Honey (100g)', substitute: 'Maple syrup 100g', notes: 'Slightly thinner' },
  { ingredient: 'Sour cream (100g)', substitute: 'Greek yoghurt 100g' },
  { ingredient: 'Fresh yeast (15g)', substitute: 'Instant dry yeast 5g' },
  { ingredient: 'Baking powder (1 tsp)', substitute: '¼ tsp bicarbonate + ½ tsp cream of tartar' },
  { ingredient: 'Heavy cream (240ml)', substitute: 'Coconut cream 240ml (full-fat)', notes: 'For cooking, not whipping' },
  { ingredient: 'Wine (for cooking)', substitute: 'Stock + 1 tsp wine vinegar', notes: 'Match stock type to dish' },
];

// ─── Format helpers ───────────────────────────────────────────

export function fmtSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86400) {
    const d = Math.round(s / 86400);
    return `${d} d`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtMinutes(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
