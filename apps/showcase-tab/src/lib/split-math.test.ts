import { describe, expect, test } from 'bun:test';
import { computeBalances, totalsByDirection } from './split-math.ts';
import type { Settlement, TabItem } from '../sync/tab-doc.ts';

function item(partial: Partial<TabItem> & { amount_cents: number; paid_by: string }): TabItem {
  return {
    id: partial.id ?? 'i' + Math.random().toString(36).slice(2, 8),
    label: partial.label ?? 'item',
    amount_cents: partial.amount_cents,
    paid_by: partial.paid_by,
    split_among: partial.split_among ?? [],
    created_at: partial.created_at ?? 0,
  };
}

describe('split-math — equal split', () => {
  test('one payer, three diners, clean division', () => {
    const items: TabItem[] = [item({ amount_cents: 3000, paid_by: 'a' })];
    const balances = computeBalances({ items, memberIds: ['a', 'b', 'c'] });
    expect(balances.a).toBe(2000); // paid 3000, owes 1000 of own share
    expect(balances.b).toBe(-1000);
    expect(balances.c).toBe(-1000);
  });

  test('every member appears in balances even if they paid nothing and owe nothing', () => {
    const balances = computeBalances({ items: [], memberIds: ['a', 'b', 'c'] });
    expect(Object.keys(balances).sort()).toEqual(['a', 'b', 'c']);
    for (const v of Object.values(balances)) expect(v).toBe(0);
  });

  test('single-person tab — they owe themselves nothing net', () => {
    const items: TabItem[] = [item({ amount_cents: 1500, paid_by: 'a' })];
    const balances = computeBalances({ items, memberIds: ['a'] });
    expect(balances.a).toBe(0); // paid 1500, owes 1500
  });
});

describe('split-math — custom split_among', () => {
  test('item shared by two of three members', () => {
    const items: TabItem[] = [
      item({ amount_cents: 1000, paid_by: 'a', split_among: ['a', 'b'] }),
    ];
    const balances = computeBalances({ items, memberIds: ['a', 'b', 'c'] });
    expect(balances.a).toBe(500); // paid 1000, owes 500
    expect(balances.b).toBe(-500);
    expect(balances.c).toBe(0); // not in split set
  });

  test('split_among may include a member who has since left', () => {
    const items: TabItem[] = [
      item({ amount_cents: 1000, paid_by: 'a', split_among: ['a', 'departed'] }),
    ];
    const balances = computeBalances({ items, memberIds: ['a'] });
    expect(balances.a).toBe(500);
    expect(balances.departed).toBe(-500);
  });
});

describe('split-math — mixed payers', () => {
  test('two payers, three diners, default split', () => {
    const items: TabItem[] = [
      item({ amount_cents: 3000, paid_by: 'a' }), // dinner
      item({ amount_cents: 1500, paid_by: 'b' }), // wine
    ];
    const balances = computeBalances({ items, memberIds: ['a', 'b', 'c'] });
    // each owes 1000+500 = 1500 of their share
    // a: paid 3000, owes 1500 → +1500
    // b: paid 1500, owes 1500 → 0
    // c: paid 0, owes 1500 → -1500
    expect(balances.a).toBe(1500);
    expect(balances.b).toBe(0);
    expect(balances.c).toBe(-1500);
  });

  test('balances always sum to zero (conservation of money)', () => {
    const items: TabItem[] = [
      item({ amount_cents: 4500, paid_by: 'a' }),
      item({ amount_cents: 2000, paid_by: 'c', split_among: ['a', 'c'] }),
      item({ amount_cents: 800, paid_by: 'b' }),
    ];
    const balances = computeBalances({ items, memberIds: ['a', 'b', 'c'] });
    const sum = Object.values(balances).reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });
});

describe('split-math — rounding', () => {
  test('non-divisible amount distributes pennies stably (id-sorted gets the extra)', () => {
    const items: TabItem[] = [
      item({ amount_cents: 1001, paid_by: 'z' }), // 1001 / 3 = 333.66...
    ];
    const balances = computeBalances({ items, memberIds: ['a', 'b', 'z'] });
    // 1001/3 = 333 base, remainder 2 → first two in id-sorted order
    // pay 334, third pays 333. Sorted: [a, b, z]. So a owes 334,
    // b owes 334, z owes 333 (and gets credit 1001).
    expect(balances.a).toBe(-334);
    expect(balances.b).toBe(-334);
    expect(balances.z).toBe(1001 - 333);
    const sum = Object.values(balances).reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });

  test('zero or negative amount items are ignored', () => {
    const items: TabItem[] = [
      item({ amount_cents: 0, paid_by: 'a' }),
      item({ amount_cents: -100, paid_by: 'a' }),
    ];
    const balances = computeBalances({ items, memberIds: ['a', 'b'] });
    expect(balances.a).toBe(0);
    expect(balances.b).toBe(0);
  });
});

describe('split-math — settlements', () => {
  test('a manual settlement reduces the debtor’s debt', () => {
    const items: TabItem[] = [item({ amount_cents: 2000, paid_by: 'a' })];
    const settlements: Settlement[] = [
      { id: 's1', from: 'b', to: 'a', amount_cents: 1000, settled_at: 0 },
    ];
    const balances = computeBalances({
      items,
      memberIds: ['a', 'b'],
      settlements,
    });
    // Before settlement: a +1000, b -1000.
    // After: b paid 1000 to a → a 0, b 0.
    expect(balances.a).toBe(0);
    expect(balances.b).toBe(0);
  });
});

describe('split-math — totalsByDirection', () => {
  test('owed and owing magnitudes match', () => {
    const balances = { a: 1500, b: 0, c: -1500 };
    const t = totalsByDirection(balances);
    expect(t.owed).toBe(1500);
    expect(t.owing).toBe(1500);
  });
});
