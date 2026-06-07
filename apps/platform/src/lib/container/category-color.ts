/**
 * Phase 5 — category-based monogram colour (spec §8). Turns the tool-tile
 * monograms from arbitrary per-app confetti into wayfinding: one colour per
 * category family. Normalizes BOTH vocabularies — the generated curation
 * vocab (`first-party-curation.ts`, which `state.ts` writes over each spec's
 * category) AND the raw `curatedAppSpecs` / custom strings — into 6 families,
 * returning a CSS custom-property reference resolved against tokens.css.
 *
 * Category-first by default; a tool may still override sparingly via its own
 * `accent` if it earns strong brand equity later.
 */
// Brand palette only — sunset / sage / marigold (the Shippie trio). No
// off-brand violet/steel-blue. Six families collapse onto the four brand
// hues; per-tool variety still comes from the slug-hashed warm accent
// fallback in `accentColor`.
const FAMILY: Record<string, string> = {
  // Cooking
  'food-drink': 'var(--sunset)',
  cooking: 'var(--sunset)',
  // Health / fitness
  'health-fitness': 'var(--sage-leaf)',
  health: 'var(--sage-leaf)',
  fitness: 'var(--sage-leaf)',
  wellness: 'var(--sage-leaf)',
  // Games / playful
  games: 'var(--marigold)',
  'arcade-cabinet': 'var(--marigold)',
  strategy: 'var(--marigold)',
  creative: 'var(--marigold)',
  creativity: 'var(--marigold)',
  // Personal (was violet → deep sage)
  'daily-brain': 'var(--sage-moss)',
  room: 'var(--sage-moss)',
  social: 'var(--sage-moss)',
  journal: 'var(--sage-moss)',
  memory: 'var(--sage-moss)',
  family: 'var(--sage-moss)',
  // Utilities / data (was steel-blue → marigold)
  tools: 'var(--marigold)',
  money: 'var(--marigold)',
  productivity: 'var(--marigold)',
  home: 'var(--marigold)',
  travel: 'var(--marigold)',
};

const UNKNOWN = 'var(--text-light)';

export function categoryColorFamily(category: string | undefined | null): string {
  if (!category) return UNKNOWN;
  return FAMILY[category.toLowerCase()] ?? UNKNOWN;
}
