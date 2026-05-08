import { describe, expect, test } from 'bun:test';
import { netSettlements } from './netting.ts';

describe('netting — trivial', () => {
  test('empty balances → no transfers', () => {
    expect(netSettlements({})).toEqual([]);
  });

  test('all-zero balances → no transfers', () => {
    expect(netSettlements({ a: 0, b: 0, c: 0 })).toEqual([]);
  });
});

describe('netting — two-person', () => {
  test('one debtor, one creditor → single transfer', () => {
    const transfers = netSettlements({ a: 1000, b: -1000 });
    expect(transfers).toEqual([{ from: 'b', to: 'a', amount_cents: 1000 }]);
  });
});

describe('netting — three-person triangle', () => {
  test('three-way circular debt collapses to fewer transactions', () => {
    // Balances: a=+1500, b=0, c=-1500. The naive view might be "b
    // owes a 500, c owes b 500, c owes a 1000" → 3 transactions.
    // After netting it should be "c owes a 1500" → 1 transaction.
    const transfers = netSettlements({ a: 1500, b: 0, c: -1500 });
    expect(transfers).toEqual([{ from: 'c', to: 'a', amount_cents: 1500 }]);
  });

  test('three-way: two creditors, one debtor → two transactions', () => {
    const transfers = netSettlements({ a: 1000, b: 500, c: -1500 });
    expect(transfers.length).toBe(2);
    // c is the only debtor; pays a (larger creditor) first, then b.
    expect(transfers[0]).toEqual({ from: 'c', to: 'a', amount_cents: 1000 });
    expect(transfers[1]).toEqual({ from: 'c', to: 'b', amount_cents: 500 });
  });
});

describe('netting — four-person', () => {
  test('two debtors, two creditors — produces ≤ 3 transactions', () => {
    const balances = { a: 2000, b: 1000, c: -500, d: -2500 };
    const transfers = netSettlements(balances);
    // Conservation: total transferred TO equals total credit.
    const totalCredited = transfers.reduce((s, t) => s + t.amount_cents, 0);
    expect(totalCredited).toBe(3000); // a + b
    // Greedy expectation: d (-2500) → a (+2000) for 2000, leaving d -500.
    //                     d (-500) → b (+1000) for 500, leaving b +500.
    //                     c (-500) → b (+500) for 500.
    // 3 transactions; ≤ n-1 = 3.
    expect(transfers.length).toBeLessThanOrEqual(3);
    // Verify the simulated balances zero out.
    const sim: Record<string, number> = { ...balances };
    for (const t of transfers) {
      sim[t.from] = (sim[t.from] ?? 0) + t.amount_cents;
      sim[t.to] = (sim[t.to] ?? 0) - t.amount_cents;
    }
    for (const v of Object.values(sim)) expect(v).toBe(0);
  });
});

describe('netting — stability', () => {
  test('id-sorted tiebreaker means equal balances always produce the same transfer', () => {
    const t1 = netSettlements({ alex: 500, sam: -500 });
    const t2 = netSettlements({ sam: -500, alex: 500 });
    expect(t1).toEqual(t2);
  });
});
