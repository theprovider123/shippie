import { describe, expect, test } from 'bun:test';
import { DEFAULT_QUICK_TAP_SEEDS, bumpTally, pickQuickTapChips } from './quick-tap.ts';
import type { QuickTapTally } from './types.ts';

const NOW = Date.parse('2026-05-05T09:00:00.000Z');

describe('quick-tap', () => {
  test('bumpTally counts manual adds, ignores mesh/meal-plan/recurring', () => {
    let tallies: readonly QuickTapTally[] = [];
    tallies = bumpTally(tallies, 'milk', 'manual', NOW);
    tallies = bumpTally(tallies, 'milk', 'mesh', NOW);
    tallies = bumpTally(tallies, 'milk', 'meal-plan', NOW);
    tallies = bumpTally(tallies, 'milk', 'recurring', NOW);
    tallies = bumpTally(tallies, 'milk', 'voice', NOW);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]?.count).toBe(2);
  });

  test('bumpTally is case-insensitive on dedup but preserves first-seen casing', () => {
    let tallies: readonly QuickTapTally[] = [];
    tallies = bumpTally(tallies, 'Milk', 'manual', NOW);
    tallies = bumpTally(tallies, 'milk', 'manual', NOW + 1000);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]?.name).toBe('Milk');
    expect(tallies[0]?.count).toBe(2);
  });

  test('pickQuickTapChips falls back to seeds when tally empty', () => {
    const chips = pickQuickTapChips({ tallies: [], liveItemNames: [] });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0]).toBe(DEFAULT_QUICK_TAP_SEEDS[0]);
  });

  test('pickQuickTapChips orders by count then recency, excludes live items', () => {
    const tallies: QuickTapTally[] = [
      { name: 'eggs', count: 2, lastAddedAt: '2026-05-04T09:00:00.000Z' },
      { name: 'milk', count: 5, lastAddedAt: '2026-05-01T09:00:00.000Z' },
      { name: 'bread', count: 5, lastAddedAt: '2026-05-04T09:00:00.000Z' },
    ];
    const chips = pickQuickTapChips({ tallies, liveItemNames: ['eggs'] });
    expect(chips[0]).toBe('bread');
    expect(chips[1]).toBe('milk');
    expect(chips).not.toContain('eggs');
  });

  test('pickQuickTapChips pads sparse user tallies with default seeds', () => {
    const tallies: QuickTapTally[] = [{ name: 'fancy mustard', count: 1, lastAddedAt: '2026-05-04T09:00:00.000Z' }];
    const chips = pickQuickTapChips({ tallies, liveItemNames: [] });
    expect(chips[0]).toBe('fancy mustard');
    expect(chips.length).toBeGreaterThan(1);
  });
});
