// src/lib/container/rail-groups.test.ts
import { describe, expect, it } from 'vitest';
import { buildRailGroups, type RailTool } from './rail-groups';

const tool = (slug: string): RailTool => ({
  slug,
  name: slug[0]!.toUpperCase() + slug.slice(1),
  icon: slug.slice(0, 2).toUpperCase(),
  accent: '#E8603C',
});
const catalog: RailTool[] = ['palate', 'chiwit', 'lift', 'golazo', 'tab'].map(tool);

describe('buildRailGroups', () => {
  it('hides Open when nothing is running', () => {
    const g = buildRailGroups({ catalog, openSlugs: [], saved: ['palate'], recents: [] });
    expect(g.open).toEqual([]);
    expect(g.saved.map((t) => t.slug)).toEqual(['palate']);
  });

  it('orders Open by openSlugs order and keeps Saved/Recent disjoint from Open', () => {
    const g = buildRailGroups({
      catalog,
      openSlugs: ['chiwit', 'palate'],
      saved: ['palate', 'lift'],
      recents: [{ slug: 'chiwit', lastOpened: '2026-06-01T09:00:00Z' }],
    });
    expect(g.open.map((t) => t.slug)).toEqual(['chiwit', 'palate']);
    // palate is open, so it must NOT also appear under saved
    expect(g.saved.map((t) => t.slug)).toEqual(['lift']);
    expect(g.recent).toEqual([]);
  });

  it('Recent excludes saved + open, sorts newest-first, caps at 5', () => {
    const recents = [
      { slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' }, // saved -> excluded
      { slug: 'chiwit', lastOpened: '2026-06-01T07:00:00Z' },
      { slug: 'lift', lastOpened: '2026-06-01T09:00:00Z' },
      { slug: 'golazo', lastOpened: '2026-06-01T06:00:00Z' },
    ];
    const g = buildRailGroups({ catalog, openSlugs: [], saved: ['palate'], recents, recentCap: 2 });
    expect(g.recent.map((t) => t.slug)).toEqual(['lift', 'chiwit']); // newest first, capped at 2
  });

  it('ignores slugs not present in the catalog', () => {
    const g = buildRailGroups({ catalog, openSlugs: ['ghost'], saved: ['nope'], recents: [{ slug: 'x', lastOpened: 'z' }] });
    expect(g.open).toEqual([]);
    expect(g.saved).toEqual([]);
    expect(g.recent).toEqual([]);
  });

  it('accepts legacy pinned input as saved', () => {
    const g = buildRailGroups({ catalog, openSlugs: [], pinned: ['palate'], recents: [] });
    expect(g.saved.map((t) => t.slug)).toEqual(['palate']);
  });

  it('merges saved and legacy pinned inputs without duplicates', () => {
    const g = buildRailGroups({
      catalog,
      openSlugs: [],
      saved: ['palate'],
      pinned: ['palate', 'lift'],
      recents: [],
    });

    expect(g.saved.map((t) => t.slug)).toEqual(['palate', 'lift']);
  });
});
