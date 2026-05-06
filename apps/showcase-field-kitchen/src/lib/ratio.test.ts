import { describe, expect, it } from 'bun:test';
import {
  buildBrewSettings,
  clampCoffee,
  clampRatio,
  coffeeFromWater,
  formatTimer,
  waterFromCoffee,
  RATIO_MAX,
  RATIO_MIN,
} from './ratio.ts';

describe('clampRatio', () => {
  it('clamps below the minimum', () => {
    expect(clampRatio(-3)).toBe(RATIO_MIN);
  });

  it('clamps above the maximum', () => {
    expect(clampRatio(120)).toBe(RATIO_MAX);
  });

  it('rounds to one decimal', () => {
    expect(clampRatio(16.236)).toBe(16.2);
  });

  it('falls back to 16 on garbage', () => {
    expect(clampRatio('not a number')).toBe(16);
    expect(clampRatio(NaN)).toBe(16);
  });
});

describe('clampCoffee', () => {
  it('rounds to whole grams', () => {
    expect(clampCoffee(15.6)).toBe(16);
  });

  it('refuses zero (caps at 1g)', () => {
    expect(clampCoffee(0)).toBe(1);
  });
});

describe('waterFromCoffee + coffeeFromWater', () => {
  it('round-trips a reasonable pourover', () => {
    const water = waterFromCoffee(15, 16);
    expect(water).toBe(240);
    expect(coffeeFromWater(240, 16)).toBe(15);
  });

  it('handles espresso ratios', () => {
    expect(waterFromCoffee(18, 2)).toBe(36);
  });
});

describe('buildBrewSettings', () => {
  it('returns a clamped, consistent triple', () => {
    const s = buildBrewSettings(15, 16);
    expect(s.coffee_g).toBe(15);
    expect(s.ratio).toBe(16);
    expect(s.water_g).toBe(240);
  });

  it('clamps a wild input', () => {
    const s = buildBrewSettings(9999, 9999);
    expect(s.coffee_g).toBeLessThanOrEqual(100);
    expect(s.ratio).toBeLessThanOrEqual(RATIO_MAX);
    expect(s.water_g).toBeGreaterThan(0);
  });
});

describe('formatTimer', () => {
  it('formats seconds as mm:ss', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(65)).toBe('01:05');
    expect(formatTimer(3 * 60 + 7)).toBe('03:07');
  });

  it('clamps negatives to zero', () => {
    expect(formatTimer(-5)).toBe('00:00');
  });
});
