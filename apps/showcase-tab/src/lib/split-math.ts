/**
 * split-math — given a list of items and the current member set, compute
 * each member's net balance in cents.
 *
 * Sign convention:
 *   positive = the person is OWED that much (others owe them).
 *   negative = the person OWES that much (they owe others).
 *
 * Per-item rules:
 *   - The payer is credited the full amount.
 *   - The split set is `item.split_among`, OR all current members if
 *     `split_among` is empty (the default — covers "split this round
 *     among everyone here").
 *   - If a member id in `split_among` is not in the current member set,
 *     it's still honoured (the person was at the table when the round
 *     was added, they just left). This keeps history honest.
 *   - The cents are divided by floor + remainder. The remainder pennies
 *     are distributed in stable id-sorted order so two devices computing
 *     the same item produce the same allocation.
 *   - amount_cents <= 0 contributes nothing.
 *   - empty effective split set (no members) is a no-op for that item.
 *
 * Subsequent settlement entries in the doc adjust the balances:
 *   - When `from` pays `to` X cents, `from` gets credited +X (their
 *     debt shrinks) and `to` gets debited -X (their credit shrinks).
 */
import type { Settlement, TabItem } from '../sync/tab-doc.ts';

export interface SplitMathInput {
  items: readonly TabItem[];
  /** Current member ids, in any order. Used as the "split_among = []" default. */
  memberIds: readonly string[];
  /** Manual settlement records. Optional. */
  settlements?: readonly Settlement[];
}

export type Balances = Record<string, number>;

export function computeBalances(input: SplitMathInput): Balances {
  const balances: Balances = {};
  const present = new Set(input.memberIds);

  // Seed every present member with 0 so even members who haven't paid
  // and haven't owed anything appear in the result.
  for (const id of present) balances[id] = 0;

  for (const item of input.items) {
    if (item.amount_cents <= 0) continue;

    // Effective split set: explicit list if non-empty, otherwise all
    // current members.
    const splitSet =
      item.split_among.length > 0 ? [...item.split_among] : [...present];
    if (splitSet.length === 0) continue;

    // Stable sort for deterministic remainder allocation.
    splitSet.sort();

    const total = item.amount_cents;
    const n = splitSet.length;
    const base = Math.floor(total / n);
    const remainder = total - base * n; // 0..n-1

    // Credit the payer with the full amount. Members not yet seeded
    // (e.g. someone who left the room before we started computing)
    // still need to be present in the balances map for honesty.
    if (!(item.paid_by in balances)) balances[item.paid_by] = 0;
    balances[item.paid_by] = (balances[item.paid_by] ?? 0) + total;

    // Debit each split member. First `remainder` members in
    // sorted order pay the extra penny.
    for (let i = 0; i < n; i++) {
      const id = splitSet[i]!;
      if (!(id in balances)) balances[id] = 0;
      const owed = base + (i < remainder ? 1 : 0);
      balances[id] = (balances[id] ?? 0) - owed;
    }
  }

  // Apply settlements last. A settlement records "from gave cash to
  // to" — so `from`'s debt decreases (credit them), `to`'s credit
  // decreases (debit them).
  for (const s of input.settlements ?? []) {
    if (s.amount_cents <= 0) continue;
    if (!(s.from in balances)) balances[s.from] = 0;
    if (!(s.to in balances)) balances[s.to] = 0;
    balances[s.from] = (balances[s.from] ?? 0) + s.amount_cents;
    balances[s.to] = (balances[s.to] ?? 0) - s.amount_cents;
  }

  return balances;
}

/** Sum of all positive balances === sum of all negative balances (sign-flipped). */
export function totalsByDirection(balances: Balances): { owed: number; owing: number } {
  let owed = 0;
  let owing = 0;
  for (const v of Object.values(balances)) {
    if (v > 0) owed += v;
    else if (v < 0) owing += -v;
  }
  return { owed, owing };
}
