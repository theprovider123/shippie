import { describe, expect, it } from 'vitest';
import { pickStarters } from './starters';

const cat = (slug: string) => ({ slug });
const catalog = ['palate', 'chiwit', 'lift', 'golazo', 'tab', 'journal'].map(cat);

describe('pickStarters', () => {
  it('prefers flagship slugs, in flagship order', () => {
    const out = pickStarters(catalog, ['lift', 'palate'], 4);
    expect(out.slice(0, 2).map((a) => a.slug)).toEqual(['lift', 'palate']);
    expect(out).toHaveLength(4);
  });

  it('fills the remainder from catalog order without duplicating flagship picks', () => {
    const out = pickStarters(catalog, ['lift'], 3);
    expect(out.map((a) => a.slug)).toEqual(['lift', 'palate', 'chiwit']);
  });

  it('ignores flagship slugs not present in the catalog', () => {
    const out = pickStarters(catalog, ['ghost', 'palate'], 2);
    expect(out.map((a) => a.slug)).toEqual(['palate', 'chiwit']);
  });

  it('falls back to the catalog head when no flagship slugs (un-baked)', () => {
    const out = pickStarters(catalog, [], 3);
    expect(out.map((a) => a.slug)).toEqual(['palate', 'chiwit', 'lift']);
  });

  it('never returns more than limit, and tolerates a short catalog', () => {
    expect(pickStarters(catalog.slice(0, 2), [], 4).map((a) => a.slug)).toEqual(['palate', 'chiwit']);
  });
});
