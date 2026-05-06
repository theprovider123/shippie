/**
 * Baker's percentages — every weight in a recipe is expressed as a
 * percentage of the total flour weight (which is, by definition, 100%).
 *
 * This module is the math kernel: it takes a recipe spec + a target
 * loaf weight and returns gram quantities for every ingredient. It
 * also handles flour mixes (e.g. 70% bread / 20% whole-wheat / 10% rye).
 */

export type LeavenKind =
  | 'sourdough' // levain built off a wild starter
  | 'instant-yeast'
  | 'fresh-yeast'
  | 'poolish'; // pre-ferment with commercial yeast

export type FlourKind =
  | 'bread' // ~12% protein, the workhorse
  | 'all-purpose' // ~10% protein, lower window
  | 'whole-wheat' // thirsty, denser
  | 'rye' // very thirsty, no gluten window
  | 'spelt' // close to wheat, slightly thirstier
  | 'durum'
  | '00'; // pizza flour, low-medium protein

export interface FlourPart {
  kind: FlourKind;
  /** Percentage of total flour. All parts must sum to 100. */
  pct: number;
}

export interface RecipeSpec {
  /** Bread flour, AP, whole-wheat, rye etc. — must sum to 100% across all parts. */
  flours: ReadonlyArray<FlourPart>;
  /** Total water as % of flour. 60 = stiff, 80 = wet. */
  hydration: number;
  /** Salt as % of flour. 1.8–2.2 is the safe band. */
  salt: number;
  /** Leaven (levain or commercial yeast or poolish) as % of flour. */
  leavenPct: number;
  /** What the leaven is. Drives schedule shape elsewhere. */
  leaven: LeavenKind;
}

export interface DoughWeights {
  flour_g: number;
  /** Per-flour breakdown — same order as recipe.flours. */
  flour_breakdown: ReadonlyArray<{ kind: FlourKind; grams: number }>;
  water_g: number;
  salt_g: number;
  leaven_g: number;
  /** Total dough mass = flour + water + salt + leaven. */
  total_g: number;
}

/**
 * Round to 1 decimal — useful for salt (which is small) and leaven.
 */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compute gram weights from a recipe + target dough mass.
 *
 * The math: total dough mass = flour × (1 + hydration% + salt% + leaven%).
 * We invert that to find the flour, then derive the rest.
 *
 * Note this treats the leaven mass as if it were inert flour — for a
 * 20% sourdough levain the slight overestimate (since the levain is
 * itself ~half flour, half water) is well within the noise of home
 * baking. Bakers who care can tweak by adjusting hydration up a
 * point or two.
 */
export function computeWeights(spec: RecipeSpec, targetTotalG: number): DoughWeights {
  if (targetTotalG <= 0) {
    return {
      flour_g: 0,
      flour_breakdown: spec.flours.map((f) => ({ kind: f.kind, grams: 0 })),
      water_g: 0,
      salt_g: 0,
      leaven_g: 0,
      total_g: 0,
    };
  }
  const totalPct = 100 + spec.hydration + spec.salt + spec.leavenPct;
  const flour_g = Math.round((targetTotalG * 100) / totalPct);
  const water_g = Math.round((flour_g * spec.hydration) / 100);
  const salt_g = r1((flour_g * spec.salt) / 100);
  const leaven_g = r1((flour_g * spec.leavenPct) / 100);
  const flour_breakdown = spec.flours.map((part) => ({
    kind: part.kind,
    grams: Math.round((flour_g * part.pct) / 100),
  }));
  return {
    flour_g,
    flour_breakdown,
    water_g,
    salt_g,
    leaven_g,
    total_g: flour_g + water_g + Math.round(salt_g) + Math.round(leaven_g),
  };
}

/**
 * Validate a flour mix sums to 100 (within 0.5% rounding tolerance).
 * Returns null on success, an error string on failure.
 */
export function validateFlourMix(flours: ReadonlyArray<FlourPart>): string | null {
  if (flours.length === 0) return 'Add at least one flour.';
  const sum = flours.reduce((acc, f) => acc + f.pct, 0);
  if (Math.abs(sum - 100) > 0.5) {
    return `Flour mix sums to ${sum.toFixed(1)}% — must total 100%.`;
  }
  for (const f of flours) {
    if (f.pct < 0) return `${flourLabel(f.kind)} can't be negative.`;
  }
  return null;
}

export function flourLabel(kind: FlourKind): string {
  switch (kind) {
    case 'bread':
      return 'Bread flour';
    case 'all-purpose':
      return 'All-purpose';
    case 'whole-wheat':
      return 'Whole-wheat';
    case 'rye':
      return 'Rye';
    case 'spelt':
      return 'Spelt';
    case 'durum':
      return 'Durum';
    case '00':
      return '"00"';
  }
}

export function leavenLabel(kind: LeavenKind): string {
  switch (kind) {
    case 'sourdough':
      return 'Levain';
    case 'instant-yeast':
      return 'Instant yeast';
    case 'fresh-yeast':
      return 'Fresh yeast';
    case 'poolish':
      return 'Poolish';
  }
}
