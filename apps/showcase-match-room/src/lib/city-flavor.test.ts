import { describe, it, expect } from 'bun:test';
import { cityTreatmentClass, cityTier } from './city-flavor.ts';

describe('cityTreatmentClass', () => {
  it('returns named class for hero cities', () => {
    expect(cityTreatmentClass('MEX-CITY')).toBe('mexico-city-treatment');
    expect(cityTreatmentClass('NYNJ')).toBe('ny-nj-treatment');
    expect(cityTreatmentClass('LA')).toBe('la-treatment');
  });

  it('returns named class for featured cities', () => {
    expect(cityTreatmentClass('MIA')).toBe('miami-treatment');
    expect(cityTreatmentClass('TOR')).toBe('toronto-treatment');
    expect(cityTreatmentClass('VAN')).toBe('vancouver-treatment');
    expect(cityTreatmentClass('GDL')).toBe('guadalajara-treatment');
    expect(cityTreatmentClass('MTY')).toBe('monterrey-treatment');
  });

  it('returns empty string for curated cities and unknowns', () => {
    expect(cityTreatmentClass('ATL')).toBe('');
    expect(cityTreatmentClass('SEA')).toBe('');
    expect(cityTreatmentClass(undefined)).toBe('');
    expect(cityTreatmentClass(null)).toBe('');
  });
});

describe('cityTier', () => {
  it('classifies hero cities', () => {
    expect(cityTier('MEX-CITY')).toBe('hero');
    expect(cityTier('NYNJ')).toBe('hero');
    expect(cityTier('LA')).toBe('hero');
  });

  it('classifies featured cities', () => {
    expect(cityTier('MIA')).toBe('featured');
    expect(cityTier('TOR')).toBe('featured');
    expect(cityTier('GDL')).toBe('featured');
  });

  it('classifies remaining cities as curated', () => {
    expect(cityTier('ATL')).toBe('curated');
    expect(cityTier('BOS')).toBe('curated');
    expect(cityTier('SEA')).toBe('curated');
    expect(cityTier(undefined)).toBe('curated');
  });
});
