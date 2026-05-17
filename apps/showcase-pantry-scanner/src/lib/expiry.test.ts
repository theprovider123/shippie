import { describe, expect, test } from 'bun:test';
import {
  bucketFor,
  daysUntil,
  groupByBucket,
  phraseDays,
  sortBySoonestExpiry,
  urgentItems,
} from './expiry.ts';
import type { Item } from './types.ts';

function fakeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: overrides.id ?? 'i_1',
    name: overrides.name ?? 'Eggs',
    nameKey: overrides.nameKey ?? 'eggs',
    quantity: overrides.quantity ?? 6,
    unit: overrides.unit ?? 'ea',
    location: overrides.location ?? 'fridge',
    addedAt: overrides.addedAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00.000Z',
    expiresOn: overrides.expiresOn,
    barcode: overrides.barcode,
    notes: overrides.notes,
  };
}

const NOW = Date.parse('2026-05-05T12:00:00.000Z');

describe('daysUntil', () => {
  test('returns 0 for today', () => {
    expect(daysUntil('2026-05-05', NOW)).toBe(0);
  });

  test('returns positive for the future', () => {
    expect(daysUntil('2026-05-08', NOW)).toBe(3);
  });

  test('returns negative for the past', () => {
    expect(daysUntil('2026-05-03', NOW)).toBe(-2);
  });

  test('returns POSITIVE_INFINITY for unparseable input', () => {
    expect(daysUntil('not-a-date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('bucketFor', () => {
  test('expired when the date is in the past', () => {
    const it = fakeItem({ expiresOn: '2026-05-01' });
    expect(bucketFor(it, NOW)).toBe('expired');
  });

  test('use-today when expires today', () => {
    const it = fakeItem({ expiresOn: '2026-05-05' });
    expect(bucketFor(it, NOW)).toBe('use-today');
  });

  test('use-soon for 1-3 days out', () => {
    expect(bucketFor(fakeItem({ expiresOn: '2026-05-06' }), NOW)).toBe(
      'use-soon',
    );
    expect(bucketFor(fakeItem({ expiresOn: '2026-05-08' }), NOW)).toBe(
      'use-soon',
    );
  });

  test('this-week for 4-7 days out', () => {
    expect(bucketFor(fakeItem({ expiresOn: '2026-05-12' }), NOW)).toBe(
      'this-week',
    );
  });

  test('fresh when more than a week away', () => {
    expect(bucketFor(fakeItem({ expiresOn: '2026-06-30' }), NOW)).toBe(
      'fresh',
    );
  });

  test('no-date when expiresOn missing', () => {
    expect(bucketFor(fakeItem({}), NOW)).toBe('no-date');
  });
});

describe('sortBySoonestExpiry', () => {
  test('soonest expiry first; undated items last', () => {
    const items = [
      fakeItem({ id: 'a', expiresOn: '2026-06-01' }),
      fakeItem({ id: 'b' }),
      fakeItem({ id: 'c', expiresOn: '2026-05-06' }),
      fakeItem({ id: 'd', expiresOn: '2026-05-05' }),
    ];
    const sorted = sortBySoonestExpiry(items).map((i) => i.id);
    expect(sorted).toEqual(['d', 'c', 'a', 'b']);
  });
});

describe('urgentItems', () => {
  test('returns expired + use-today + use-soon, sorted soonest-first', () => {
    const items = [
      fakeItem({ id: 'fresh', expiresOn: '2026-08-01' }),
      fakeItem({ id: 'expired', expiresOn: '2026-05-01' }),
      fakeItem({ id: 'today', expiresOn: '2026-05-05' }),
      fakeItem({ id: 'soon', expiresOn: '2026-05-07' }),
      fakeItem({ id: 'no-date' }),
    ];
    const ids = urgentItems(items, NOW).map((i) => i.id);
    expect(ids).toEqual(['expired', 'today', 'soon']);
  });
});

describe('groupByBucket', () => {
  test('returns every bucket key, even when empty', () => {
    const groups = groupByBucket([fakeItem({ expiresOn: '2026-05-05' })], NOW);
    expect(Object.keys(groups).sort()).toContain('fresh');
    expect(groups['use-today']).toHaveLength(1);
    expect(groups.fresh).toHaveLength(0);
  });
});

describe('phraseDays', () => {
  test('today / tomorrow / N days', () => {
    expect(phraseDays(0)).toBe('today');
    expect(phraseDays(1)).toBe('tomorrow');
    expect(phraseDays(3)).toBe('in 3 days');
  });

  test('past dates', () => {
    expect(phraseDays(-1)).toBe('1 day past');
    expect(phraseDays(-4)).toBe('4 days past');
  });

  test('non-finite returns "no date"', () => {
    expect(phraseDays(Number.POSITIVE_INFINITY)).toBe('no date');
  });
});
