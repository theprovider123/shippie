import { describe, expect, test } from 'bun:test';
import {
  CADENCES,
  DEFAULT_CADENCE_DAYS,
  cadenceByKey,
  cadenceForDays,
  effectiveCadenceDays,
} from './cadence.ts';

describe('cadence · profiles', () => {
  test('inner < warm < occasional < dormant in days', () => {
    const inner = cadenceByKey('inner');
    const warm = cadenceByKey('warm');
    const occasional = cadenceByKey('occasional');
    const dormant = cadenceByKey('dormant');
    expect(inner.days).toBeLessThan(warm.days);
    expect(warm.days).toBeLessThan(occasional.days);
    expect(occasional.days).toBeLessThan(dormant.days);
  });

  test('all four cadences exist with non-empty hints', () => {
    expect(CADENCES).toHaveLength(4);
    for (const c of CADENCES) {
      expect(c.hint.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  test('cadenceForDays snaps to the closest profile', () => {
    expect(cadenceForDays(7).key).toBe('inner');
    expect(cadenceForDays(30).key).toBe('inner');
    expect(cadenceForDays(45).key).toBe('warm');
    expect(cadenceForDays(60).key).toBe('warm');
    expect(cadenceForDays(120).key).toBe('occasional');
    expect(cadenceForDays(180).key).toBe('occasional');
    expect(cadenceForDays(365).key).toBe('dormant');
    expect(cadenceForDays(800).key).toBe('dormant');
  });

  test('cadenceByKey throws on unknown', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => cadenceByKey('nope')).toThrow();
  });

  test('effectiveCadenceDays falls back when null/undefined/zero', () => {
    expect(effectiveCadenceDays(null)).toBe(DEFAULT_CADENCE_DAYS);
    expect(effectiveCadenceDays(undefined)).toBe(DEFAULT_CADENCE_DAYS);
    expect(effectiveCadenceDays(0)).toBe(DEFAULT_CADENCE_DAYS);
    expect(effectiveCadenceDays(45)).toBe(45);
  });
});
