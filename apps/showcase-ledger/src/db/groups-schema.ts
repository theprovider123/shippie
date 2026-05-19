/**
 * Ledger Groups — local schemas for split-the-bill / group-expense tracking.
 *
 * Two tables: `groups`, `group_expenses`.
 *
 *   - Groups own a base currency (display + settle-up) and a JSON
 *     member roster. Members are local-named only — no global user
 *     account model. One member is flagged `is_me` so "you owe £X"
 *     style read-outs are easy.
 *   - Expenses carry their own currency (multi-currency by design)
 *     and an explicit list of members they split among. MVP supports
 *     equal split; custom shares are a follow-up.
 *
 * No PII goes to a server. The whole feature works on-device. Groups
 * are exchanged via signed share fragments (see ../share/group-share.ts).
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const GROUPS_TABLE = 'groups';
export const GROUP_EXPENSES_TABLE = 'group_expenses';

export const groupsSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  base_currency: 'text not null',
  members_json: 'text not null',
  created_at: 'datetime',
};

export const groupExpensesSchema: LocalDbSchema = {
  id: 'text primary key',
  group_id: 'text not null',
  paid_by_id: 'text not null',
  amount_cents: 'integer not null',
  currency: 'text not null',
  note: 'text',
  occurred_on: 'text not null',
  split_among_json: 'text not null',
  created_at: 'datetime',
};

export interface GroupMember {
  id: string;
  name: string;
  /** True for the member representing the current device's user. Exactly one per group. */
  is_me?: boolean;
}

export interface Group {
  id: string;
  name: string;
  base_currency: string;
  members: GroupMember[];
  created_at: number;
}

export interface GroupExpense {
  id: string;
  group_id: string;
  paid_by_id: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  occurred_on: string;
  split_among: string[];
  created_at: number;
}
