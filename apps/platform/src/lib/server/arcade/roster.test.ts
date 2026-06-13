import { describe, expect, it } from 'vitest';
import { bakedArcadeGameSlugs, partitionRoster, type ArcadeAppRow } from './roster';

describe('bakedArcadeGameSlugs', () => {
  it('is derived from generated curation surface=arcade and includes docklands but not non-games', () => {
    const slugs = bakedArcadeGameSlugs();
    expect(slugs.has('snake')).toBe(true);
    expect(slugs.has('docklands')).toBe(true);
    expect(slugs.has('palate')).toBe(false);
  });
});

describe('partitionRoster', () => {
  const baked = new Set(['snake', 'crossing', 'docklands']);
  const row = (slug: string, o: Partial<ArcadeAppRow> = {}): ArcadeAppRow => ({
    slug, surface: 'arcade', visibilityScope: 'public', isArchived: false, suspendedAt: null, ...o,
  });

  it('enables only baked, public, arcade-surface, non-suspended, non-archived rows', () => {
    const { enabled } = partitionRoster([row('snake'), row('crossing')], baked);
    expect(enabled).toEqual(['snake', 'crossing']);
  });

  it('excludes a pulled (surface=archived) game from enabled and from blocked', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { surface: 'archived' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });

  it('lists a suspended baked game in blocked, not enabled', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { suspendedAt: '2026-06-13T00:00:00Z' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual(['snake']);
  });

  it('lists a taken-down (is_archived) baked game in blocked, not enabled', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { isArchived: true })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual(['snake']);
  });

  it('ignores a surface=arcade row whose slug is not baked (returns it in neither set)', () => {
    const { enabled, blocked } = partitionRoster([row('rogue-remix')], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });

  it('treats a non-public baked arcade game as neither enabled nor blocked', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { visibilityScope: 'unlisted' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });
});
