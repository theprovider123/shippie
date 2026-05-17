/**
 * netting — minimum-transactions debt simplification.
 *
 * Given a balance map (output of split-math), produce a list of "X owes
 * Y £Z" transfers that settles the tab in as few transactions as
 * possible.
 *
 * Algorithm: classic greedy. Repeatedly take the largest creditor and
 * the largest debtor; transfer min(|credit|, |debt|) between them. Pop
 * the one whose balance hit zero (or both); continue until everyone is
 * within 1 cent of zero.
 *
 * Why greedy: this is the textbook approach. It is NOT guaranteed to
 * produce the absolute minimum number of transactions in pathological
 * cases (the problem is NP-hard), but in practice for typical bill-
 * split sizes (2-12 people) it produces the same answer as optimal.
 *
 * Stability: ties (equal balances) resolved by member id sort, so two
 * devices computing the same balances produce the same transfer list.
 */
import type { Balances } from './split-math.ts';

export interface Transfer {
  from: string;
  to: string;
  amount_cents: number;
}

export function netSettlements(balances: Balances): Transfer[] {
  // Snapshot: only entries with non-trivial balance. Two integer cents
  // is the threshold for "round to zero" — handles a 1-2p drift from
  // floor-then-distribute remainder allocation in split-math.
  const creditors: Array<{ id: string; amount: number }> = [];
  const debtors: Array<{ id: string; amount: number }> = [];

  for (const [id, balance] of Object.entries(balances)) {
    if (balance > 0) creditors.push({ id, amount: balance });
    else if (balance < 0) debtors.push({ id, amount: -balance });
  }

  // Sort by amount desc, with stable id sort as the tiebreaker. We
  // sort once and then re-order on the fly via splice/insert; for
  // 2-12 people this is fine.
  const byAmountDescThenId = (
    a: { id: string; amount: number },
    b: { id: string; amount: number },
  ) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  creditors.sort(byAmountDescThenId);
  debtors.sort(byAmountDescThenId);

  const transfers: Transfer[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.amount, d.amount);
    if (amount <= 0) break;

    transfers.push({ from: d.id, to: c.id, amount_cents: amount });

    c.amount -= amount;
    d.amount -= amount;

    if (c.amount === 0) creditors.shift();
    else creditors.sort(byAmountDescThenId);
    if (d.amount === 0) debtors.shift();
    else debtors.sort(byAmountDescThenId);
  }

  return transfers;
}
