/**
 * Settle-up calculator. Given a set of net balances per member (in the
 * group's base currency, integer cents), return the minimum-transaction
 * set of "X pays Y N" instructions that brings everyone to zero.
 *
 * Algorithm: greedy. Pair the biggest creditor with the biggest debtor,
 * transfer `min(creditor, |debtor|)`, repeat. Not provably optimal for
 * adversarial input but matches Splitwise's behaviour and produces
 * intuitive small-N results.
 *
 * Tolerance is 1 cent — drifts under that are treated as zero.
 */

export interface Balance {
  memberId: string;
  cents: number; // positive: is owed; negative: owes
}

export interface Transfer {
  from: string; // memberId that pays
  to: string; // memberId that receives
  cents: number; // always positive
}

const TOLERANCE_CENTS = 1;

export function settleUp(balances: ReadonlyArray<Balance>): Transfer[] {
  // Copy so we can mutate. Filter out near-zero rows up front.
  const working = balances
    .map((b) => ({ ...b }))
    .filter((b) => Math.abs(b.cents) > TOLERANCE_CENTS);

  const transfers: Transfer[] = [];

  while (working.length > 1) {
    working.sort((a, b) => a.cents - b.cents); // most negative first
    const debtor = working[0]!; // owes the most (negative)
    const creditor = working[working.length - 1]!; // owed the most (positive)
    if (debtor.cents >= -TOLERANCE_CENTS || creditor.cents <= TOLERANCE_CENTS) break;
    const amount = Math.min(-debtor.cents, creditor.cents);
    transfers.push({ from: debtor.memberId, to: creditor.memberId, cents: amount });
    debtor.cents += amount;
    creditor.cents -= amount;
    // Remove settled rows
    const filtered = working.filter((row) => Math.abs(row.cents) > TOLERANCE_CENTS);
    working.length = 0;
    working.push(...filtered);
  }

  return transfers;
}

/**
 * Sum-check helper for tests: the absolute total of all transfers
 * equals (in expectation) the sum of positive balances. Useful for
 * asserting we moved exactly the right amount of money.
 */
export function totalMoved(transfers: ReadonlyArray<Transfer>): number {
  return transfers.reduce((sum, t) => sum + t.cents, 0);
}
