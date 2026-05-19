/**
 * Local-DB CRUD for Ledger Groups. Mirrors the entries-queries shape:
 * thin async helpers around `ShippieLocalDb` that hide the SQL/OPFS
 * details from React.
 *
 * Balance computation lives here too because it depends on FX rates
 * and the schema; settle-up is currency-agnostic and stays in lib/.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  GROUPS_TABLE,
  GROUP_EXPENSES_TABLE,
  groupsSchema,
  groupExpensesSchema,
  type Group,
  type GroupExpense,
  type GroupMember,
} from './groups-schema.ts';
import { convertCents } from '../lib/fx.ts';
import type { Balance } from '../lib/settle-up.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

interface GroupRow {
  id: string;
  name: string;
  base_currency: string;
  members_json: string;
  created_at: number;
}

interface ExpenseRow {
  id: string;
  group_id: string;
  paid_by_id: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  occurred_on: string;
  split_among_json: string;
  created_at: number;
}

const groupsInitCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureGroupSchema(db: ShippieLocalDb): Promise<void> {
  let pending = groupsInitCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(GROUPS_TABLE, groupsSchema);
      await db.create(GROUP_EXPENSES_TABLE, groupExpensesSchema);
    })();
    groupsInitCache.set(db, pending);
  }
  await pending;
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseMembers(json: string): GroupMember[] {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (m): m is GroupMember => typeof m === 'object' && m !== null && typeof m.id === 'string' && typeof m.name === 'string',
    );
  } catch {
    return [];
  }
}

function parseSplit(json: string): string[] {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    base_currency: row.base_currency,
    members: parseMembers(row.members_json),
    created_at: row.created_at,
  };
}

function rowToExpense(row: ExpenseRow): GroupExpense {
  return {
    id: row.id,
    group_id: row.group_id,
    paid_by_id: row.paid_by_id,
    amount_cents: row.amount_cents,
    currency: row.currency,
    note: row.note,
    occurred_on: row.occurred_on,
    split_among: parseSplit(row.split_among_json),
    created_at: row.created_at,
  };
}

// ── Groups ─────────────────────────────────────────────────────────────

export async function listGroups(db: ShippieLocalDb): Promise<Group[]> {
  await ensureGroupSchema(db);
  const rows = await db.query<RowOf<GroupRow>>(GROUPS_TABLE, {});
  return rows.map(rowToGroup).sort((a, b) => b.created_at - a.created_at);
}

export async function getGroup(db: ShippieLocalDb, id: string): Promise<Group | null> {
  await ensureGroupSchema(db);
  const rows = await db.query<RowOf<GroupRow>>(GROUPS_TABLE, { where: { id }, limit: 1 });
  return rows[0] ? rowToGroup(rows[0]) : null;
}

export async function createGroup(
  db: ShippieLocalDb,
  input: { name: string; base_currency: string; members: GroupMember[] },
): Promise<Group> {
  await ensureGroupSchema(db);
  const group: Group = {
    id: newId('grp'),
    name: input.name.trim(),
    base_currency: input.base_currency,
    members: input.members,
    created_at: Date.now(),
  };
  await db.insert(
    GROUPS_TABLE,
    asRow({
      id: group.id,
      name: group.name,
      base_currency: group.base_currency,
      members_json: JSON.stringify(group.members),
      created_at: group.created_at,
    }),
  );
  return group;
}

export async function updateGroupMembers(
  db: ShippieLocalDb,
  id: string,
  members: GroupMember[],
): Promise<void> {
  await ensureGroupSchema(db);
  await db.update(GROUPS_TABLE, id, asRow({ members_json: JSON.stringify(members) }));
}

export async function deleteGroup(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureGroupSchema(db);
  const expenses = await db.query<RowOf<ExpenseRow>>(GROUP_EXPENSES_TABLE, {
    where: { group_id: id },
  });
  for (const exp of expenses) {
    await db.delete(GROUP_EXPENSES_TABLE, exp.id);
  }
  await db.delete(GROUPS_TABLE, id);
}

// ── Expenses ───────────────────────────────────────────────────────────

export async function listExpensesForGroup(
  db: ShippieLocalDb,
  groupId: string,
): Promise<GroupExpense[]> {
  await ensureGroupSchema(db);
  const rows = await db.query<RowOf<ExpenseRow>>(GROUP_EXPENSES_TABLE, {
    where: { group_id: groupId },
  });
  return rows.map(rowToExpense).sort((a, b) => b.created_at - a.created_at);
}

export async function createGroupExpense(
  db: ShippieLocalDb,
  input: {
    group_id: string;
    paid_by_id: string;
    amount_cents: number;
    currency: string;
    note: string | null;
    occurred_on: string;
    split_among: string[];
  },
): Promise<GroupExpense> {
  await ensureGroupSchema(db);
  const expense: GroupExpense = {
    id: newId('gex'),
    group_id: input.group_id,
    paid_by_id: input.paid_by_id,
    amount_cents: input.amount_cents,
    currency: input.currency,
    note: input.note,
    occurred_on: input.occurred_on,
    split_among: input.split_among,
    created_at: Date.now(),
  };
  await db.insert(
    GROUP_EXPENSES_TABLE,
    asRow({
      id: expense.id,
      group_id: expense.group_id,
      paid_by_id: expense.paid_by_id,
      amount_cents: expense.amount_cents,
      currency: expense.currency,
      note: expense.note,
      occurred_on: expense.occurred_on,
      split_among_json: JSON.stringify(expense.split_among),
      created_at: expense.created_at,
    }),
  );
  return expense;
}

export async function deleteGroupExpense(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureGroupSchema(db);
  await db.delete(GROUP_EXPENSES_TABLE, id);
}

// ── Balances ───────────────────────────────────────────────────────────

/**
 * Computes each member's net balance in the group's `base_currency`,
 * integer cents. Positive = is owed; negative = owes.
 *
 * Equal-split MVP: an expense splits evenly across `split_among`. The
 * payer's share is deducted from the amount they paid (they are owed
 * the rest by the other splitters).
 */
export function computeBalances(
  group: Group,
  expenses: ReadonlyArray<GroupExpense>,
): Balance[] {
  const totals = new Map<string, number>();
  for (const m of group.members) totals.set(m.id, 0);
  for (const expense of expenses) {
    const splitters = expense.split_among.length > 0 ? expense.split_among : group.members.map((m) => m.id);
    const inBase = convertCents(expense.amount_cents, expense.currency, group.base_currency);
    const sharePerPerson = Math.round(inBase / splitters.length);
    // Payer is owed the full amount they spent.
    totals.set(expense.paid_by_id, (totals.get(expense.paid_by_id) ?? 0) + inBase);
    // Each splitter (incl. payer) owes a share.
    for (const memberId of splitters) {
      totals.set(memberId, (totals.get(memberId) ?? 0) - sharePerPerson);
    }
  }
  return group.members.map((m) => ({ memberId: m.id, cents: totals.get(m.id) ?? 0 }));
}
