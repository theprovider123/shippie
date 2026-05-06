/**
 * Query helpers around `shippie.local.db`. Everything is async because the
 * underlying engine is wa-sqlite + OPFS (off-main-thread). Components stay
 * free of SQL-shaped knowledge.
 *
 * Money is stored as integer cents. Only the input/display layer parses or
 * formats decimal strings; aggregates use integer math.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  CATEGORIES_TABLE,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  ENTRIES_TABLE,
  RECURRING_TABLE,
  SETTINGS_TABLE,
  categoriesSchema,
  entriesSchema,
  recurringSchema,
  settingsSchema,
  type Cadence,
  type Category,
  type Entry,
  type EntryKind,
  type Recurring,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(ENTRIES_TABLE, entriesSchema);
      await db.create(CATEGORIES_TABLE, categoriesSchema);
      await db.create(RECURRING_TABLE, recurringSchema);
      await db.create(SETTINGS_TABLE, settingsSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Settings ───────────────────────────────────────────────────────────

export async function getSetting(db: ShippieLocalDb, id: string): Promise<string | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<{ id: string; value: string | null }>>(SETTINGS_TABLE, {
    where: { id },
    limit: 1,
  });
  const v = rows[0]?.value;
  return typeof v === 'string' ? v : null;
}

export async function setSetting(db: ShippieLocalDb, id: string, value: string): Promise<void> {
  await ensureSchema(db);
  const existing = await db.query(SETTINGS_TABLE, { where: { id }, limit: 1 });
  if (existing.length === 0) {
    await db.insert(SETTINGS_TABLE, asRow({ id, value }));
  } else {
    await db.update(SETTINGS_TABLE, id, asRow({ value }));
  }
}

export async function getCurrency(db: ShippieLocalDb): Promise<string> {
  return (await getSetting(db, 'currency')) ?? DEFAULT_CURRENCY;
}

export async function setCurrency(db: ShippieLocalDb, currency: string): Promise<void> {
  await setSetting(db, 'currency', currency);
}

// ── Categories ─────────────────────────────────────────────────────────

export async function listCategories(db: ShippieLocalDb): Promise<Category[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Category>>(CATEGORIES_TABLE);
  return [...rows].sort(
    (a, b) =>
      (a.sort_order ?? 1e6) - (b.sort_order ?? 1e6) || a.label.localeCompare(b.label),
  );
}

export async function seedDefaultCategories(db: ShippieLocalDb): Promise<{ seeded: boolean }> {
  await ensureSchema(db);
  const existing = await listCategories(db);
  if (existing.length > 0) return { seeded: false };
  for (const c of DEFAULT_CATEGORIES) {
    await addCategory(db, c.label, c.sort_order);
  }
  return { seeded: true };
}

export async function addCategory(
  db: ShippieLocalDb,
  label: string,
  sort_order?: number,
): Promise<Category> {
  await ensureSchema(db);
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Category label cannot be empty.');
  let nextOrder = sort_order;
  if (nextOrder === undefined) {
    const cats = await listCategories(db);
    nextOrder = cats.length === 0 ? 0 : Math.max(...cats.map((c) => c.sort_order ?? 0)) + 1;
  }
  const cat: Category = { id: newId(), label: trimmed, sort_order: nextOrder };
  await db.insert(CATEGORIES_TABLE, asRow(cat));
  return cat;
}

export async function renameCategory(
  db: ShippieLocalDb,
  id: string,
  label: string,
): Promise<void> {
  await ensureSchema(db);
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Category label cannot be empty.');
  await db.update<RowOf<Category>>(CATEGORIES_TABLE, id, asRow({ label: trimmed }));
}

export async function deleteCategory(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  // Detach entries that referenced this category — they keep their amounts
  // and notes; the category column becomes null. The user's data is
  // never silently lost when a category is removed.
  const refs = await db.query<RowOf<Entry>>(ENTRIES_TABLE, { where: { category_id: id } });
  for (const e of refs) {
    await db.update<RowOf<Entry>>(ENTRIES_TABLE, e.id, asRow({ category_id: null }));
  }
  const recurringRefs = await db.query<RowOf<Recurring>>(RECURRING_TABLE, {
    where: { category_id: id },
  });
  for (const r of recurringRefs) {
    await db.update<RowOf<Recurring>>(RECURRING_TABLE, r.id, asRow({ category_id: null }));
  }
  await db.delete(CATEGORIES_TABLE, id);
}

// ── Entries ────────────────────────────────────────────────────────────

export interface CreateEntryInput {
  kind: EntryKind;
  amount_cents: number;
  currency?: string;
  category_id?: string | null;
  note?: string | null;
  occurred_on?: string;
}

export async function createEntry(
  db: ShippieLocalDb,
  input: CreateEntryInput,
): Promise<Entry> {
  await ensureSchema(db);
  if (!Number.isFinite(input.amount_cents) || input.amount_cents < 0) {
    throw new Error('Amount must be a non-negative integer (cents).');
  }
  const currency = input.currency ?? (await getCurrency(db));
  const now = new Date();
  const entry: Entry = {
    id: newId(),
    kind: input.kind,
    amount_cents: Math.round(input.amount_cents),
    currency,
    category_id: input.category_id ?? null,
    note: input.note ?? null,
    occurred_on: input.occurred_on ?? toIsoDate(now),
    created_at: now.toISOString(),
  };
  await db.insert(ENTRIES_TABLE, asRow(entry));
  return entry;
}

export async function deleteEntry(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(ENTRIES_TABLE, id);
}

export async function updateEntry(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Entry, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Entry>>(ENTRIES_TABLE, id, asRow(patch));
}

export async function listEntries(db: ShippieLocalDb): Promise<Entry[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Entry>>(ENTRIES_TABLE);
  return [...rows].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
}

export async function listEntriesInRange(
  db: ShippieLocalDb,
  startIso: string,
  endIsoExclusive: string,
): Promise<Entry[]> {
  const all = await listEntries(db);
  return all.filter((e) => e.occurred_on >= startIso && e.occurred_on < endIsoExclusive);
}

export async function listEntriesForMonth(
  db: ShippieLocalDb,
  year: number,
  month: number,
): Promise<Entry[]> {
  const { startIso, endIso } = monthRange(year, month);
  return listEntriesInRange(db, startIso, endIso);
}

export async function listEntriesForYear(
  db: ShippieLocalDb,
  year: number,
): Promise<Entry[]> {
  const startIso = `${year.toString().padStart(4, '0')}-01-01`;
  const endIso = `${(year + 1).toString().padStart(4, '0')}-01-01`;
  return listEntriesInRange(db, startIso, endIso);
}

// ── Aggregates ─────────────────────────────────────────────────────────

export interface CategoryTotal {
  category_id: string | null;
  label: string;
  spend_cents: number;
  income_cents: number;
}

export interface MonthTotals {
  spend_cents: number;
  income_cents: number;
  net_cents: number;
  by_category: CategoryTotal[];
}

export function aggregateByCategory(
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
): MonthTotals {
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  const buckets = new Map<string, CategoryTotal>();
  let spend = 0;
  let income = 0;
  for (const e of entries) {
    const key = e.category_id ?? '__uncategorised__';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        category_id: e.category_id ?? null,
        label: e.category_id ? labelById.get(e.category_id) ?? 'Removed category' : 'Uncategorised',
        spend_cents: 0,
        income_cents: 0,
      };
      buckets.set(key, bucket);
    }
    if (e.kind === 'spend') {
      bucket.spend_cents += e.amount_cents;
      spend += e.amount_cents;
    } else {
      bucket.income_cents += e.amount_cents;
      income += e.amount_cents;
    }
  }
  const by_category = [...buckets.values()].sort(
    (a, b) => b.spend_cents - a.spend_cents || b.income_cents - a.income_cents,
  );
  return {
    spend_cents: spend,
    income_cents: income,
    net_cents: income - spend,
    by_category,
  };
}

export async function monthTotals(
  db: ShippieLocalDb,
  year: number,
  month: number,
): Promise<MonthTotals> {
  const [entries, categories] = await Promise.all([
    listEntriesForMonth(db, year, month),
    listCategories(db),
  ]);
  return aggregateByCategory(entries, categories);
}

// ── Recurring ──────────────────────────────────────────────────────────

export interface CreateRecurringInput {
  kind: EntryKind;
  amount_cents: number;
  currency?: string;
  category_id?: string | null;
  note?: string | null;
  cadence: Cadence;
  next_due?: string;
}

export async function listRecurring(db: ShippieLocalDb): Promise<Recurring[]> {
  await ensureSchema(db);
  return db.query<RowOf<Recurring>>(RECURRING_TABLE);
}

export async function createRecurring(
  db: ShippieLocalDb,
  input: CreateRecurringInput,
): Promise<Recurring> {
  await ensureSchema(db);
  if (!Number.isFinite(input.amount_cents) || input.amount_cents < 0) {
    throw new Error('Amount must be a non-negative integer (cents).');
  }
  const currency = input.currency ?? (await getCurrency(db));
  const next_due = input.next_due ?? toIsoDate(new Date());
  const row: Recurring = {
    id: newId(),
    kind: input.kind,
    amount_cents: Math.round(input.amount_cents),
    currency,
    category_id: input.category_id ?? null,
    note: input.note ?? null,
    cadence: input.cadence,
    next_due,
    active: 1,
  };
  await db.insert(RECURRING_TABLE, asRow(row));
  return row;
}

export async function updateRecurring(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Recurring, 'id'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Recurring>>(RECURRING_TABLE, id, asRow(patch));
}

export async function deleteRecurring(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(RECURRING_TABLE, id);
}

export async function setRecurringActive(
  db: ShippieLocalDb,
  id: string,
  active: boolean,
): Promise<void> {
  await updateRecurring(db, id, { active: active ? 1 : 0 });
}

/**
 * Apply a recurring template now: insert an entry and advance `next_due`
 * by the cadence. Returns the created entry. The user is the one who
 * tapped "apply"; nothing runs on a schedule.
 */
export async function applyRecurringNow(
  db: ShippieLocalDb,
  recurring: Recurring,
  occurredOn?: string,
): Promise<Entry> {
  const today = occurredOn ?? toIsoDate(new Date());
  const entry = await createEntry(db, {
    kind: recurring.kind,
    amount_cents: recurring.amount_cents,
    currency: recurring.currency,
    category_id: recurring.category_id ?? null,
    note: recurring.note ?? null,
    occurred_on: today,
  });
  const advanced = advanceCadence(recurring.next_due, recurring.cadence);
  await updateRecurring(db, recurring.id, { next_due: advanced });
  return entry;
}

export async function dueRecurring(
  db: ShippieLocalDb,
  asOf?: string,
): Promise<Recurring[]> {
  const today = asOf ?? toIsoDate(new Date());
  const all = await listRecurring(db);
  return all.filter((r) => r.active === 1 && r.next_due <= today);
}

// ── CSV export ─────────────────────────────────────────────────────────

export interface CsvRow {
  date: string;
  kind: EntryKind;
  amount: string;
  currency: string;
  category: string;
  note: string;
}

export function entriesToCsv(
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
): string {
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  const header = 'date,kind,amount,currency,category,note';
  const rows = entries.map((e) =>
    [
      e.occurred_on,
      e.kind,
      formatCentsForCsv(e.amount_cents),
      e.currency,
      e.category_id ? labelById.get(e.category_id) ?? '' : '',
      e.note ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export function entriesToCsvRows(
  entries: ReadonlyArray<Entry>,
  categories: ReadonlyArray<Category>,
): CsvRow[] {
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  return entries.map((e) => ({
    date: e.occurred_on,
    kind: e.kind,
    amount: formatCentsForCsv(e.amount_cents),
    currency: e.currency,
    category: e.category_id ? labelById.get(e.category_id) ?? '' : '',
    note: e.note ?? '',
  }));
}

function csvEscape(value: string): string {
  if (value === '') return '';
  // Quote if contains comma, quote, newline, or carriage return.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCentsForCsv(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minor}`;
}

// ── Date helpers ───────────────────────────────────────────────────────

export function toIsoDate(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthRange(year: number, month: number): { startIso: string; endIso: string } {
  const startIso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endIso = `${nextYear.toString().padStart(4, '0')}-${nextMonth.toString().padStart(2, '0')}-01`;
  return { startIso, endIso };
}

export function advanceCadence(dateIso: string, cadence: Cadence): string {
  const [yStr, mStr, dStr] = dateIso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (cadence === 'monthly') {
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    // Clamp to the last day of the next month if needed (e.g. 31st → Feb).
    const lastDay = lastDayOfMonth(nextY, nextM);
    const nextD = Math.min(d, lastDay);
    return `${nextY.toString().padStart(4, '0')}-${nextM.toString().padStart(2, '0')}-${nextD
      .toString()
      .padStart(2, '0')}`;
  }
  const days = cadence === 'weekly' ? 7 : 14;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  const ny = base.getUTCFullYear();
  const nm = base.getUTCMonth() + 1;
  const nd = base.getUTCDate();
  return `${ny.toString().padStart(4, '0')}-${nm.toString().padStart(2, '0')}-${nd
    .toString()
    .padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ── Money parse / format ───────────────────────────────────────────────

/**
 * Parse `12.50` or `12` or `12,50` into integer cents. Returns null on
 * gibberish — the input layer is responsible for surfacing the
 * voice-doc error copy ("That amount didn't parse. Try `12.50` or `12`.").
 *
 * Rules:
 *   - A single `.` or `,` is the decimal separator (one of either, not both).
 *   - Up to 2 digits after the decimal. More digits → reject.
 *   - Whitespace, leading currency symbols (£, $, €) tolerated and stripped.
 *   - Negative inputs rejected — the input form handles sign by entry kind.
 */
export function parseAmountToCents(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  // Strip a leading currency symbol if present.
  s = s.replace(/^[£$€¥]/, '').trim();
  if (!s) return null;
  if (s.startsWith('-') || s.startsWith('+')) return null;
  // Allow comma as decimal — but not both . and , in the same input.
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) return null;
  if (hasComma) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '00').slice(0, 2);
  const cents = Number(whole) * 100 + Number(fracPadded);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

export function formatCents(cents: number, currency: string): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = (abs % 100).toString().padStart(2, '0');
  const symbol = currencySymbol(currency);
  return `${negative ? '-' : ''}${symbol}${major}.${minor}`;
}

export function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case 'GBP':
      return '£';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'JPY':
      return '¥';
    case 'AUD':
    case 'CAD':
    case 'NZD':
      return '$';
    default:
      return `${code} `;
  }
}
