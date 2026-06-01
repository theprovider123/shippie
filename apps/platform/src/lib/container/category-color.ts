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
  // Personal
  'daily-brain': 'var(--accent-violet)',
  room: 'var(--accent-violet)',
  social: 'var(--accent-violet)',
  journal: 'var(--accent-violet)',
  memory: 'var(--accent-violet)',
  family: 'var(--accent-violet)',
  // Utilities / data
  tools: 'var(--info)',
  money: 'var(--info)',
  productivity: 'var(--info)',
  home: 'var(--info)',
  travel: 'var(--info)',
};

const UNKNOWN = 'var(--text-light)';

export function categoryColorFamily(category: string | undefined | null): string {
  if (!category) return UNKNOWN;
  return FAMILY[category.toLowerCase()] ?? UNKNOWN;
}
