import { describe, expect, it } from 'bun:test';
import { COOK_METHODS } from '../db/schema.ts';
import { describeProgress, getMethodProfile, METHOD_PROFILES } from './methods.ts';

describe('METHOD_PROFILES', () => {
  it('exists for every known method', () => {
    for (const m of COOK_METHODS) {
      expect(METHOD_PROFILES[m]).toBeDefined();
    }
  });

  it('pan does not want a probe; smoking does', () => {
    expect(getMethodProfile('pan').wantsInternalTemp).toBe(false);
    expect(getMethodProfile('smoking').wantsInternalTemp).toBe(true);
  });

  it('every profile has at least one guidance bullet', () => {
    for (const profile of Object.values(METHOD_PROFILES)) {
      expect(profile.guidance.length).toBeGreaterThan(0);
    }
  });
});

describe('describeProgress', () => {
  it('returns empty for pan (no probe)', () => {
    expect(describeProgress('pan', 80)).toBe('');
  });

  it('returns empty when temp is missing', () => {
    expect(describeProgress('sous-vide', null)).toBe('');
  });

  it('says "Climbing" when far below target', () => {
    const profile = getMethodProfile('sous-vide');
    const far = (profile.defaultTempC ?? 0) - 20;
    expect(describeProgress('sous-vide', far)).toMatch(/^Climbing/);
  });

  it('says "On target" when within 1°C', () => {
    const profile = getMethodProfile('sous-vide');
    expect(describeProgress('sous-vide', profile.defaultTempC!)).toMatch(/On target/);
  });

  it('says "Past target" when over', () => {
    const profile = getMethodProfile('sous-vide');
    expect(describeProgress('sous-vide', (profile.defaultTempC ?? 0) + 5)).toMatch(/Past target/);
  });
});
