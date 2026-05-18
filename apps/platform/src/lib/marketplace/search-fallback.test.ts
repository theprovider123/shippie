import { describe, expect, it } from 'vitest';
import { suggestApps, suggestCategories } from './search-fallback';

const pool = [
  { slug: 'read-later', name: 'Read Later', tagline: 'Save articles to read offline.', category: 'productivity' },
  { slug: 'voice-memo', name: 'Voice Memo', tagline: 'Tap to record, transcribe later.', category: 'productivity' },
  { slug: 'receipt-snap', name: 'Receipt Snap', tagline: 'Photograph receipts, extract totals.', category: 'tools' },
  { slug: 'snake', name: 'Snake', tagline: 'Classic snake game.', category: 'games' },
  { slug: 'meal-planner', name: 'Meal Planner', tagline: 'Plan the week, shop once.', category: 'food-drink' },
];

describe('suggestApps', () => {
  it('finds direct token matches', () => {
    const out = suggestApps('read articles', pool);
    expect(out[0]?.slug).toBe('read-later');
  });

  it('finds partial substring matches', () => {
    const out = suggestApps('pdf save', pool);
    expect(out.some((a) => a.slug === 'read-later')).toBe(true);
  });

  it('returns an empty array when nothing scores', () => {
    expect(suggestApps('xyzzy', pool)).toEqual([]);
  });

  it('respects the limit', () => {
    const out = suggestApps('plan game record', pool, 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('handles empty query', () => {
    expect(suggestApps('', pool)).toEqual([]);
  });
});

describe('suggestCategories', () => {
  const categories = ['productivity', 'tools', 'creativity', 'games', 'food-drink'];

  it('returns query-relevant categories first', () => {
    const out = suggestCategories('drink water', categories);
    expect(out[0]).toBe('food-drink');
  });

  it('falls back to the default order when no scores hit', () => {
    expect(suggestCategories('xyzzy', categories, 2)).toEqual(['productivity', 'tools']);
  });

  it('falls back when query is empty', () => {
    expect(suggestCategories('', categories, 3)).toEqual(['productivity', 'tools', 'creativity']);
  });
});
