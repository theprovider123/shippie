import { describe, expect, it } from 'vitest';
import { resolveShareCandidates, shouldOfferShareSheet } from './share-bus';

const installedApps = [
  { slug: 'shopping-list', name: 'Shopping List', consumes: ['recipe', 'pantry-low'] },
  { slug: 'meal-planner', name: 'Meal Planner', consumes: ['recipe', 'cooking-now'] },
  { slug: 'journal', name: 'Journal', consumes: ['mood-logged'] },
];

describe('resolveShareCandidates', () => {
  it('returns one row per (app, kind) match', () => {
    const result = resolveShareCandidates({ kinds: ['recipe'] }, installedApps);
    expect(result.map((r) => r.appSlug)).toEqual(['meal-planner', 'shopping-list']);
  });

  it('matches case-insensitively', () => {
    const result = resolveShareCandidates({ kinds: ['RECIPE'] }, installedApps);
    expect(result.map((r) => r.appSlug)).toEqual(['meal-planner', 'shopping-list']);
  });

  it('respects multiple requested kinds, deduplicated per (app, kind)', () => {
    const result = resolveShareCandidates({ kinds: ['recipe', 'pantry-low'] }, installedApps);
    expect(result.map((r) => ({ slug: r.appSlug, kind: r.kind }))).toEqual([
      { slug: 'meal-planner', kind: 'recipe' },
      { slug: 'shopping-list', kind: 'pantry-low' },
      { slug: 'shopping-list', kind: 'recipe' },
    ]);
  });

  it('returns an empty list when no app consumes a matching kind', () => {
    const result = resolveShareCandidates({ kinds: ['unknown-kind'] }, installedApps);
    expect(result).toEqual([]);
  });
});

describe('shouldOfferShareSheet', () => {
  it('returns false when no candidates', () => {
    expect(shouldOfferShareSheet([])).toBe(false);
  });
  it('returns true when there is at least one candidate', () => {
    expect(
      shouldOfferShareSheet([{ appSlug: 'a', appName: 'A', kind: 'recipe' }]),
    ).toBe(true);
  });
});
