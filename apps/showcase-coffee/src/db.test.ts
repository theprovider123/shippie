import { describe, expect, test } from 'bun:test';
import { METHOD_DEFAULTS, METHOD_LABEL, MG_PER_GRAM, round1 } from './db';

describe('coffee db', () => {
  test('METHOD_DEFAULTS covers all methods with sane ratios', () => {
    expect(METHOD_DEFAULTS.v60.ratio).toBeGreaterThan(12);
    expect(METHOD_DEFAULTS.v60.ratio).toBeLessThan(20);
    expect(METHOD_DEFAULTS.espresso.ratio).toBeLessThan(3);
    expect(METHOD_DEFAULTS.espresso.ratio).toBeGreaterThan(1);
  });

  test('METHOD_LABEL has a label per method', () => {
    for (const m of Object.keys(METHOD_DEFAULTS) as Array<keyof typeof METHOD_DEFAULTS>) {
      expect(METHOD_LABEL[m]).toBeTruthy();
    }
  });

  test('caffeine mg per gram is plausible (espresso > drip)', () => {
    expect(MG_PER_GRAM.espresso).toBeGreaterThan(MG_PER_GRAM.v60);
    expect(MG_PER_GRAM.aeropress).toBeGreaterThan(MG_PER_GRAM.chemex);
  });

  test('round1 keeps one decimal', () => {
    expect(round1(15.444)).toBe(15.4);
    expect(round1(15.456)).toBe(15.5);
    expect(round1(15)).toBe(15);
  });
});
