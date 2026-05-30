import { describe, expect, it } from 'vitest';
import { buildToolShelf } from './tool-shelf';
import type { ToolEntry } from './tool-entry';

function tool(over: Partial<ToolEntry>): ToolEntry {
  return {
    slug: 'tap',
    name: 'Tap',
    shortName: 'Tap',
    description: 'tap things',
    themeColor: '#000',
    category: 'tools',
    kind: 'local',
    surface: 'featured',
    availability: 'live',
    intents: { provides: [], consumes: [] },
    firstPartySigned: true,
    ...over,
  };
}

const catalog: ToolEntry[] = [
  tool({ slug: 'cycle', name: 'Cycle', category: 'health-fitness' }),
  tool({ slug: 'tab', name: 'Tab', category: 'social' }),
  tool({ slug: 'ledger', name: 'Ledger', category: 'productivity' }),
  tool({ slug: 'chiwit', name: 'Chiwit', category: 'health-fitness' }),
  tool({ slug: 'palate', name: 'Palate', category: 'food-drink' }),
  // archived alias surfaces (legacy slugs that should NEVER display)
  tool({ slug: 'recipe', availability: 'redirect', redirectTo: 'palate' }),
  tool({ slug: 'cooking', availability: 'redirect', redirectTo: 'palate' }),
  // upcoming (golazo case): hidden by default, promoted in world-cup phase
  tool({ slug: 'golazo', name: 'Golazo', category: 'games', availability: 'upcoming' }),
  // archived (no successor): hidden everywhere
  tool({ slug: 'snap-and-forget', availability: 'archived' }),
];

describe('buildToolShelf', () => {
  it('hides archived, redirect, and upcoming entries from every section', () => {
    const shelf = buildToolShelf({ catalog });
    const shown = shelf.allLive.map((t) => t.slug);
    expect(shown).toContain('cycle');
    expect(shown).toContain('palate');
    expect(shown).not.toContain('recipe');
    expect(shown).not.toContain('cooking');
    expect(shown).not.toContain('golazo');
    expect(shown).not.toContain('snap-and-forget');
  });

  it('promotes upcoming slugs to live for the listed phase', () => {
    const shelf = buildToolShelf({
      catalog,
      phase: 'world-cup',
      promotions: { promote: ['golazo'] },
    });
    expect(shelf.allLive.map((t) => t.slug)).toContain('golazo');
  });

  it('places active + live + pinned + recent in Quick, in that priority', () => {
    const shelf = buildToolShelf({
      catalog,
      activeSlug: 'tab',
      liveSlugs: ['cycle'],
      pinnedSlugs: ['ledger'],
      recentSlugs: ['palate'],
    });
    const quick = shelf.sections.find((s) => s.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.tools.map((t) => t.slug)).toEqual(['tab', 'cycle', 'ledger', 'palate']);
  });

  it('canonicalises pinned/recent slugs before lookup', () => {
    // User saved `recipe` before SLUG_ALIASES landed; it should
    // resolve to `palate` in Quick instead of being silently dropped.
    const shelf = buildToolShelf({
      catalog,
      pinnedSlugs: ['recipe'],
      recentSlugs: ['chiwit'],
    });
    const quick = shelf.sections.find((s) => s.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.tools.map((t) => t.slug)).toEqual(['palate', 'chiwit']);
  });

  it('omits Quick when nothing is pinned, recent, active, or live', () => {
    const shelf = buildToolShelf({ catalog });
    expect(shelf.sections.find((s) => s.id === 'quick')).toBeUndefined();
  });

  it('All excludes anything already in Quick', () => {
    const shelf = buildToolShelf({ catalog, pinnedSlugs: ['cycle'] });
    const quick = shelf.sections.find((s) => s.id === 'quick');
    const all = shelf.sections.find((s) => s.id === 'all');
    expect(quick!.tools.map((t) => t.slug)).toEqual(['cycle']);
    expect(all!.tools.map((t) => t.slug)).not.toContain('cycle');
  });

  it('filters by query across both Quick and All', () => {
    const shelf = buildToolShelf({
      catalog,
      pinnedSlugs: ['cycle', 'palate'],
      query: 'palate',
    });
    const quick = shelf.sections.find((s) => s.id === 'quick');
    const all = shelf.sections.find((s) => s.id === 'all');
    expect(quick!.tools.map((t) => t.slug)).toEqual(['palate']);
    expect(all).toBeUndefined();
  });

  it('filters by category', () => {
    const shelf = buildToolShelf({ catalog, categoryFilter: 'food-drink' });
    expect(shelf.allLive.map((t) => t.slug)).toEqual(['palate']);
  });

  it('deduplicates aliased entries arriving from multiple sources', () => {
    // Suppose two upstream sources both surface "recipe" and "palate".
    // After canonicalisation only the live one survives, exactly once.
    const dupCatalog: ToolEntry[] = [
      tool({ slug: 'palate', name: 'Palate' }),
      tool({ slug: 'recipe', availability: 'redirect', redirectTo: 'palate' }),
    ];
    const shelf = buildToolShelf({ catalog: dupCatalog });
    expect(shelf.allLive.map((t) => t.slug)).toEqual(['palate']);
  });

  it('respects quickCap', () => {
    const big = Array.from({ length: 20 }, (_, i) =>
      tool({ slug: `t${i}`, name: `T${i}` }),
    );
    const shelf = buildToolShelf({
      catalog: big,
      pinnedSlugs: big.map((t) => t.slug),
      quickCap: 5,
    });
    expect(shelf.sections.find((s) => s.id === 'quick')!.tools.length).toBe(5);
  });

  it('exposes a sorted visibleSlugs convenience for regression testing', () => {
    const shelf = buildToolShelf({ catalog });
    expect(shelf.visibleSlugs).toEqual([...shelf.visibleSlugs].sort());
  });
});
