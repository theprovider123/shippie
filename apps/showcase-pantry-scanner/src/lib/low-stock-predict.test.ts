import { describe, expect, test } from 'bun:test';
import {
  consumptionEventFromItem,
  predictLowStock,
} from './low-stock-predict.ts';
import type { ConsumptionEvent, Item } from './types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-05T12:00:00.000Z');

function eggsLog(): ConsumptionEvent[] {
  // Eggs every 4 days for the last 24 days.
  const out: ConsumptionEvent[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    out.push({
      nameKey: 'eggs',
      at: new Date(NOW - i * 4 * ONE_DAY_MS).toISOString(),
      source: 'manual',
    });
  }
  return out;
}

function inStock(): Item[] {
  return [];
}

describe('predictLowStock', () => {
  test('flags an item with a steady cadence and overdue last consumption', () => {
    // Most recent eggs event is exactly NOW (-0 days) from eggsLog.
    // Move the simulated "now" 8 days ahead so we're 2× the 4-day cadence.
    const events = eggsLog();
    const overdueNow = NOW + 8 * ONE_DAY_MS;
    const out = predictLowStock(events, { now: overdueNow });
    expect(out).toHaveLength(1);
    expect(out[0]!.nameKey).toBe('eggs');
    expect(out[0]!.averageIntervalDays).toBe(4);
    expect(out[0]!.daysSinceLast).toBe(8);
  });

  test('does not flag when the user has the item in stock', () => {
    const events = eggsLog();
    const items: Item[] = [
      {
        id: 'i_1',
        name: 'Eggs',
        nameKey: 'eggs',
        quantity: 6,
        unit: 'ea',
        location: 'fridge',
        addedAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ];
    const out = predictLowStock(events, {
      now: NOW + 8 * ONE_DAY_MS,
      inStock: items,
    });
    expect(out).toHaveLength(0);
  });

  test('does not flag below minEvents threshold', () => {
    const events: ConsumptionEvent[] = [
      { nameKey: 'salt', at: new Date(NOW - 4 * ONE_DAY_MS).toISOString(), source: 'manual' },
      { nameKey: 'salt', at: new Date(NOW).toISOString(), source: 'manual' },
    ];
    const out = predictLowStock(events, {
      now: NOW + 30 * ONE_DAY_MS,
      minEvents: 3,
    });
    expect(out).toHaveLength(0);
  });

  test('does not flag when last consumption is within 1.5× average', () => {
    const events = eggsLog();
    // Only 5 days since last → 1.25× the 4-day average → should not flag.
    const out = predictLowStock(events, { now: NOW + 5 * ONE_DAY_MS });
    expect(out).toHaveLength(0);
  });

  test('orders predictions by overdue ratio (most overdue first)', () => {
    const events: ConsumptionEvent[] = [
      ...eggsLog(),
      // milk every 7 days, last one 2 weeks back → 2× overdue
      { nameKey: 'milk', at: new Date(NOW - 35 * ONE_DAY_MS).toISOString(), source: 'manual' },
      { nameKey: 'milk', at: new Date(NOW - 28 * ONE_DAY_MS).toISOString(), source: 'manual' },
      { nameKey: 'milk', at: new Date(NOW - 21 * ONE_DAY_MS).toISOString(), source: 'manual' },
      { nameKey: 'milk', at: new Date(NOW - 14 * ONE_DAY_MS).toISOString(), source: 'manual' },
    ];
    // Push "now" forward 16 days → eggs is 16 days past 4-day cadence (4×),
    // milk is 30 days past 7-day cadence (~4.3×) — milk wins by a hair.
    const out = predictLowStock(events, { now: NOW + 16 * ONE_DAY_MS });
    expect(out.map((p) => p.nameKey)).toEqual(['milk', 'eggs']);
  });

  test('consumptionEventFromItem normalises the nameKey', () => {
    const ev = consumptionEventFromItem(
      { name: 'Greek Yoghurt', nameKey: '' },
      'cooked-meal',
      '2026-05-05T00:00:00.000Z',
    );
    expect(ev.nameKey).toBe('greek yoghurt');
    expect(ev.source).toBe('cooked-meal');
  });
});
