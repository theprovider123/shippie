import { describe, expect, test } from 'vitest';
import { appShareImagePath, appShareImageUrl, canonicalAppPath } from './showcase-slugs';

describe('showcase slug URL helpers', () => {
  test('canonical app paths are the public share surface', () => {
    expect(canonicalAppPath('golazo')).toBe('/golazo');
    expect(canonicalAppPath('shopping-list', '?invite=abc')).toBe('/palate?invite=abc&tab=shop&from=shopping-list');
    expect(canonicalAppPath('snake')).toBe('/arcade?game=snake&from=snake');
  });

  test('share image URLs follow canonical app slugs', () => {
    expect(appShareImagePath('golazo')).toBe('/api/apps/golazo/og.png');
    expect(appShareImagePath('recipe')).toBe('/api/apps/palate/og.png');
    expect(appShareImageUrl('golazo', 'https://shippie.app')).toBe('https://shippie.app/api/apps/golazo/og.png');
  });
});
