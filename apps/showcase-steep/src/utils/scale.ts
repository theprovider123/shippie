/**
 * Scale a blend's parts → grams for a batch.
 *
 * Parts are stored on `blend_ingredients` as relative ratios. At brew
 * time the user picks a batch size; we multiply each part by the
 * batch's grams-per-part to get a real measurement.
 *
 * Defaults are tuned for a typical heaped-teaspoon = 2g loose-leaf
 * baseline:
 *   - cup: 4g total target → divide across parts
 *   - pot: 12g total target
 *   - tin: 60g total target (a small batch you keep premixed)
 *
 * Custom batches just specify their own total grams.
 */
import type { BatchSize, BlendIngredient } from '../db/schema.ts';

export interface BatchPreset {
  key: BatchSize;
  label: string;
  totalGrams: number;
}

export const DEFAULT_BATCHES: BatchPreset[] = [
  { key: 'cup', label: 'One cup', totalGrams: 4 },
  { key: 'pot', label: 'One pot', totalGrams: 12 },
  { key: 'tin', label: 'Premixed tin', totalGrams: 60 },
];

export function batchPreset(key: BatchSize | null | undefined): BatchPreset {
  return DEFAULT_BATCHES.find((b) => b.key === key) ?? DEFAULT_BATCHES[0]!;
}

export interface ScaledIngredient<T extends Pick<BlendIngredient, 'parts' | 'herb_id' | 'id'>> {
  ingredient: T;
  parts: number;
  grams: number;
}

/**
 * Scale a list of blend ingredients to a target total weight.
 *
 * Returns a new array with each ingredient's grams calculated as
 *   (parts / totalParts) * targetGrams
 * Rounded to one decimal place — fine-enough precision for tea, doesn't
 * promise accuracy a kitchen scale can't deliver.
 *
 * If the total parts is zero (empty blend or all-zero parts), each
 * ingredient gets 0g rather than NaN.
 */
export function scaleToBatch<T extends Pick<BlendIngredient, 'parts' | 'herb_id' | 'id'>>(
  ingredients: T[],
  totalGrams: number,
): ScaledIngredient<T>[] {
  const totalParts = ingredients.reduce((sum, ing) => sum + ing.parts, 0);
  return ingredients.map((ing) => {
    const grams = totalParts > 0 ? round1((ing.parts / totalParts) * totalGrams) : 0;
    return { ingredient: ing, parts: ing.parts, grams };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Format grams for display: trailing-zero-stripped, "g" suffix. */
export function formatGrams(grams: number): string {
  if (!Number.isFinite(grams)) return '—';
  if (grams === 0) return '0g';
  // Trim trailing .0 so "3.0g" reads as "3g"; keep "1.5g" intact.
  const text = grams % 1 === 0 ? String(Math.round(grams)) : String(grams);
  return `${text}g`;
}
