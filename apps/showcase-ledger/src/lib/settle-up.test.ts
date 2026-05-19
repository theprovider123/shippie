import { describe, expect, it } from 'bun:test';
import { settleUp, totalMoved, type Balance } from './settle-up.ts';

describe('settleUp', () => {
  it('returns no transfers when balances are already zero', () => {
    const balances: Balance[] = [
      { memberId: 'a', cents: 0 },
      { memberId: 'b', cents: 0 },
    ];
    expect(settleUp(balances)).toEqual([]);
  });

  it('handles a two-person split with one creditor', () => {
    // A paid £30; B owes £15.
    const balances: Balance[] = [
      { memberId: 'a', cents: 1500 },
      { memberId: 'b', cents: -1500 },
    ];
    const transfers = settleUp(balances);
    expect(transfers).toEqual([{ from: 'b', to: 'a', cents: 1500 }]);
  });

  it('settles a 4-person asymmetric case with ≤ n-1 transfers', () => {
    // A and B paid; C and D owe. Greedy yields 3, which is the
    // information-theoretic minimum here (one of the debtors must
    // receive from both creditors). Should never exceed n-1.
    const balances: Balance[] = [
      { memberId: 'a', cents: 2000 },
      { memberId: 'b', cents: 1000 },
      { memberId: 'c', cents: -1500 },
      { memberId: 'd', cents: -1500 },
    ];
    const transfers = settleUp(balances);
    expect(transfers.length).toBeLessThanOrEqual(3);
    expect(totalMoved(transfers)).toBe(3000);
  });

  it('ignores sub-cent drift', () => {
    const balances: Balance[] = [
      { memberId: 'a', cents: 1 },
      { memberId: 'b', cents: -1 },
    ];
    expect(settleUp(balances)).toEqual([]);
  });

  it('every member ends at zero after transfers', () => {
    const balances: Balance[] = [
      { memberId: 'a', cents: 1230 },
      { memberId: 'b', cents: -540 },
      { memberId: 'c', cents: -690 },
    ];
    const transfers = settleUp(balances);
    const final = new Map(balances.map((b) => [b.memberId, b.cents]));
    for (const t of transfers) {
      final.set(t.from, (final.get(t.from) ?? 0) + t.cents);
      final.set(t.to, (final.get(t.to) ?? 0) - t.cents);
    }
    for (const cents of final.values()) {
      expect(Math.abs(cents)).toBeLessThanOrEqual(1);
    }
  });
});
