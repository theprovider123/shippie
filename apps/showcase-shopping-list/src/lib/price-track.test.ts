import { describe, expect, test } from 'bun:test';
import {
  appendObservation,
  cheapestStore,
  formatPence,
  latestPerStore,
  parsePence,
  runningTotal,
} from './price-track.ts';
import type { ListItem } from './types.ts';

const baseItem: ListItem = {
  id: 'eggs',
  name: 'eggs',
  checked: false,
  source: 'manual',
  addedAt: '2026-05-01T09:00:00.000Z',
};

describe('price-track', () => {
  test('parsePence handles £, decimals, and pence-suffix', () => {
    expect(parsePence('£2.40')).toBe(240);
    expect(parsePence('2.4')).toBe(240);
    expect(parsePence('2.04')).toBe(204);
    expect(parsePence('240p')).toBe(240);
    expect(parsePence('2')).toBe(200);
    expect(parsePence(' £1.99 ')).toBe(199);
    expect(parsePence('garbage')).toBeNull();
    expect(parsePence('')).toBeNull();
  });

  test('formatPence renders £X.YY with leading zeros', () => {
    expect(formatPence(240)).toBe('£2.40');
    expect(formatPence(7)).toBe('£0.07');
    expect(formatPence(0)).toBe('£0.00');
    expect(formatPence(-50)).toBe('-£0.50');
  });

  test('appendObservation skips identical same-day duplicates', () => {
    const a = appendObservation(baseItem, 'tesco', 240, '2026-05-01T09:00:00.000Z');
    const b = appendObservation(a, 'tesco', 240, '2026-05-01T15:00:00.000Z');
    expect(b.prices).toHaveLength(1);

    const c = appendObservation(a, 'tesco', 230, '2026-05-01T15:00:00.000Z');
    expect(c.prices).toHaveLength(2);
  });

  test('latestPerStore returns the newest pence per store', () => {
    let item = appendObservation(baseItem, 'tesco', 240, '2026-04-25T09:00:00.000Z');
    item = appendObservation(item, 'tesco', 250, '2026-05-02T09:00:00.000Z');
    item = appendObservation(item, 'aldi', 210, '2026-05-01T09:00:00.000Z');
    expect(latestPerStore(item.prices)).toEqual({ tesco: 250, aldi: 210 });
  });

  test('cheapestStore picks the lowest', () => {
    let item = appendObservation(baseItem, 'tesco', 250, '2026-05-02T09:00:00.000Z');
    item = appendObservation(item, 'aldi', 210, '2026-05-01T09:00:00.000Z');
    expect(cheapestStore(item.prices)).toEqual({ storeId: 'aldi', pence: 210 });
    expect(cheapestStore(undefined)).toBeNull();
  });

  test('runningTotal sums uses active-store price, falls back to cheapest', () => {
    const eggs = appendObservation(baseItem, 'tesco', 250, '2026-05-02T09:00:00.000Z');
    let bread = { ...baseItem, id: 'bread', name: 'bread' };
    bread = appendObservation(bread, 'aldi', 110, '2026-05-01T09:00:00.000Z');
    const cheese = { ...baseItem, id: 'cheese', name: 'cheese' };
    const result = runningTotal([eggs, bread, cheese], 'tesco');
    // eggs at tesco = 250, bread fallback to aldi = 110, cheese unknown
    expect(result.totalPence).toBe(360);
    expect(result.estimatedCount).toBe(1);
    expect(result.unknownCount).toBe(1);
  });

  test('runningTotal ignores checked items', () => {
    const eggs = appendObservation(baseItem, 'tesco', 250, '2026-05-02T09:00:00.000Z');
    const bread = appendObservation(
      { ...baseItem, id: 'bread', name: 'bread', checked: true },
      'tesco',
      110,
      '2026-05-01T09:00:00.000Z',
    );
    const result = runningTotal([eggs, bread], 'tesco');
    expect(result.totalPence).toBe(250);
  });
});
