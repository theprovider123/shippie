import { describe, expect, test } from 'bun:test';
import { band, daysSince, FRESHNESS_THRESHOLDS, modeFor, reading } from './freshness.ts';

const ANCHOR = new Date('2026-05-05T12:00:00Z');

function iso(daysAgo: number): string {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('freshness · daysSince', () => {
  test('returns 0 for today', () => {
    expect(daysSince(iso(0), ANCHOR)).toBe(0);
  });

  test('returns the day-floor for a past date', () => {
    expect(daysSince(iso(7), ANCHOR)).toBe(7);
    expect(daysSince(iso(30), ANCHOR)).toBe(30);
  });

  test('clamps future-dated roasts to 0', () => {
    const future = new Date(ANCHOR);
    future.setUTCDate(future.getUTCDate() + 5);
    expect(daysSince(future.toISOString().slice(0, 10), ANCHOR)).toBe(0);
  });

  test('returns 0 for malformed dates', () => {
    expect(daysSince('not-a-date', ANCHOR)).toBe(0);
  });
});

describe('freshness · modeFor', () => {
  test('espresso is espresso, everything else is filter', () => {
    expect(modeFor('espresso')).toBe('espresso');
    expect(modeFor('v60')).toBe('filter');
    expect(modeFor('aeropress')).toBe('filter');
    expect(modeFor('chemex')).toBe('filter');
    expect(modeFor('french-press')).toBe('filter');
  });
});

describe('freshness · band (filter)', () => {
  test('day 0 is rest', () => {
    expect(band('v60', 0)).toBe('rest');
  });
  test('day 7 is peak', () => {
    expect(band('v60', 7)).toBe('peak');
  });
  test('day 14 is peak (boundary inclusive)', () => {
    expect(band('v60', 14)).toBe('peak');
  });
  test('day 18 is good', () => {
    expect(band('v60', 18)).toBe('good');
  });
  test('day 28 is fading', () => {
    expect(band('v60', 28)).toBe('fading');
  });
  test('day 60 is stale', () => {
    expect(band('v60', 60)).toBe('stale');
  });
});

describe('freshness · band (espresso)', () => {
  test('espresso day 14 is peak', () => {
    expect(band('espresso', 14)).toBe('peak');
  });
  test('espresso day 28 is good', () => {
    expect(band('espresso', 28)).toBe('good');
  });
  test('espresso day 50 is fading', () => {
    expect(band('espresso', 50)).toBe('fading');
  });
  test('espresso day 100 is stale', () => {
    expect(band('espresso', 100)).toBe('stale');
  });
});

describe('freshness · reading', () => {
  test('returns null when no roast date is set', () => {
    expect(reading('v60', undefined, ANCHOR)).toBeNull();
  });

  test('peak reading carries label, hint and position', () => {
    const r = reading('v60', iso(10), ANCHOR);
    expect(r).not.toBeNull();
    expect(r?.band).toBe('peak');
    expect(r?.label).toBe('peak');
    expect(r?.hint).toMatch(/now/);
    expect(r?.position).toBeGreaterThan(0);
    expect(r?.position).toBeLessThan(1);
  });

  test('stale beans saturate position at 1', () => {
    const r = reading('v60', iso(120), ANCHOR);
    expect(r?.position).toBe(1);
    expect(r?.band).toBe('stale');
  });
});

describe('freshness · thresholds shape', () => {
  test('filter and espresso thresholds increase monotonically', () => {
    const f = FRESHNESS_THRESHOLDS.filter;
    expect(f.rest).toBeLessThan(f.peak);
    expect(f.peak).toBeLessThan(f.good);
    expect(f.good).toBeLessThan(f.fading);
    const e = FRESHNESS_THRESHOLDS.espresso;
    expect(e.rest).toBeLessThan(e.peak);
    expect(e.peak).toBeLessThan(e.good);
    expect(e.good).toBeLessThan(e.fading);
  });

  test('espresso holds longer than filter at every band', () => {
    expect(FRESHNESS_THRESHOLDS.espresso.peak).toBeGreaterThan(FRESHNESS_THRESHOLDS.filter.peak);
    expect(FRESHNESS_THRESHOLDS.espresso.good).toBeGreaterThan(FRESHNESS_THRESHOLDS.filter.good);
    expect(FRESHNESS_THRESHOLDS.espresso.fading).toBeGreaterThan(
      FRESHNESS_THRESHOLDS.filter.fading,
    );
  });
});
