import { describe, expect, it } from 'vitest';
import {
  SPOTLIGHT_GLOBAL_LIMIT,
  SPOTLIGHT_PER_APP_LIMIT,
  search,
  type SpotlightItem,
} from './spotlight';

const items: SpotlightItem[] = [
  { appSlug: 'recipe', id: 'r1', title: 'Carbonara', body: 'eggs guanciale pecorino', deeplink: '/r/r1' },
  { appSlug: 'recipe', id: 'r2', title: 'Bolognese', body: 'beef tomato carrot', deeplink: '/r/r2', kind: 'pasta' },
  { appSlug: 'journal', id: 'j1', title: 'Cooked carbonara again', body: 'turned out great', deeplink: '/j/j1', updatedAt: Date.now() - 2 * 24 * 3600 * 1000 },
  { appSlug: 'shopping-list', id: 's1', title: 'Pecorino', body: 'for carbonara', deeplink: '/s/s1' },
];

describe('Spotlight search', () => {
  it('returns empty for blank queries', () => {
    expect(search('', items)).toEqual([]);
    expect(search('   ', items)).toEqual([]);
  });

  it('ranks title hits above body hits at equal recency', () => {
    const titleOnly: SpotlightItem = {
      appSlug: 'a',
      id: 'title',
      title: 'Carbonara',
      body: 'unrelated',
      deeplink: '/t',
    };
    const bodyOnly: SpotlightItem = {
      appSlug: 'b',
      id: 'body',
      title: 'Unrelated',
      body: 'carbonara is in the body',
      deeplink: '/b',
    };
    const hits = search('carbonara', [bodyOnly, titleOnly]);
    expect(hits[0]!.id).toBe('title');
    expect(hits[1]!.id).toBe('body');
  });

  it('matches across title + body', () => {
    const hits = search('guanciale', items);
    expect(hits.map((h) => h.id)).toEqual(['r1']);
  });

  it('requires every token to be present (AND semantics)', () => {
    const hits = search('carbonara bolognese', items);
    expect(hits).toEqual([]);
  });

  it('filters by app slugs when provided', () => {
    const hits = search('carbonara', items, { appSlugs: ['journal'] });
    expect(hits.map((h) => h.id)).toEqual(['j1']);
  });

  it('filters by kind when provided', () => {
    const hits = search('bolognese', items, { kinds: ['pasta'] });
    expect(hits.map((h) => h.id)).toEqual(['r2']);
  });

  it('respects the limit cap', () => {
    const dup = Array.from({ length: 10 }, (_, i) => ({
      appSlug: 'recipe',
      id: `r${i}`,
      title: `Carbonara ${i}`,
      body: '',
      deeplink: `/r/r${i}`,
    }));
    const hits = search('carbonara', dup, { limit: 3 });
    expect(hits).toHaveLength(3);
  });

  it('gives a recency boost to recently-updated hits', () => {
    const stale: SpotlightItem = { appSlug: 'note', id: 'n-old', title: 'Carbonara old', body: '', deeplink: '/n', updatedAt: Date.now() - 365 * 24 * 3600 * 1000 };
    const fresh: SpotlightItem = { appSlug: 'note', id: 'n-fresh', title: 'Carbonara old', body: '', deeplink: '/n2', updatedAt: Date.now() - 2 * 24 * 3600 * 1000 };
    const hits = search('carbonara', [stale, fresh]);
    expect(hits[0]!.id).toBe('n-fresh');
  });

  it('exposes per-app and global cap constants', () => {
    expect(SPOTLIGHT_PER_APP_LIMIT).toBeGreaterThan(0);
    expect(SPOTLIGHT_GLOBAL_LIMIT).toBeGreaterThan(SPOTLIGHT_PER_APP_LIMIT);
  });
});
