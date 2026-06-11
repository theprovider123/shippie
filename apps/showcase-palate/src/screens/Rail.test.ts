import { describe, expect, it } from 'bun:test';
import { sortRailItems, heroFromItems, type RailItem } from './Rail.tsx';

function makeItem(id: string, remaining_s: number, isLong = false, isHeat = false): RailItem {
  return { id, title: id, remaining_s, kind: 'timer', isHeat, isLong };
}

describe('sortRailItems', () => {
  it('sorts by remaining seconds ascending', () => {
    const items = [makeItem('b', 300), makeItem('a', 60), makeItem('c', 600)];
    const sorted = sortRailItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('long ferments sink to bottom regardless of remaining', () => {
    const items = [
      makeItem('long', 10, true),
      makeItem('short1', 300),
      makeItem('short2', 600),
    ];
    const sorted = sortRailItems(items);
    expect(sorted[0]!.id).toBe('short1');
    expect(sorted[1]!.id).toBe('short2');
    expect(sorted[2]!.id).toBe('long');
  });

  it('multiple long ferments stay at bottom sorted among themselves', () => {
    const items = [
      makeItem('long1', 100, true),
      makeItem('short', 500),
      makeItem('long2', 50, true),
    ];
    const sorted = sortRailItems(items);
    expect(sorted[0]!.id).toBe('short');
    expect(sorted[1]!.id).toBe('long2');
    expect(sorted[2]!.id).toBe('long1');
  });
});

describe('heroFromItems', () => {
  it('returns the most urgent non-long item', () => {
    const items = [
      makeItem('long', 10, true),
      makeItem('a', 300),
      makeItem('b', 60),
    ];
    const hero = heroFromItems(items);
    expect(hero?.id).toBe('b');
  });

  it('returns null when all items are long', () => {
    const items = [makeItem('long', 100, true)];
    expect(heroFromItems(items)).toBeNull();
  });

  it('returns null for empty list', () => {
    expect(heroFromItems([])).toBeNull();
  });

  it('hero is item with remaining_s=0 when present', () => {
    const items = [makeItem('done', 0), makeItem('running', 120)];
    const hero = heroFromItems(items);
    expect(hero?.id).toBe('done');
  });
});
