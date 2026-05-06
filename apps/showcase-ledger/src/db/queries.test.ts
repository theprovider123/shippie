import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  addCategory,
  advanceCadence,
  aggregateByCategory,
  applyRecurringNow,
  createEntry,
  createRecurring,
  deleteCategory,
  dueRecurring,
  entriesToCsv,
  entriesToCsvRows,
  formatCents,
  getCurrency,
  listCategories,
  listEntries,
  listEntriesForMonth,
  monthTotals,
  parseAmountToCents,
  seedDefaultCategories,
  setCurrency,
} from './queries.ts';

describe('parseAmountToCents', () => {
  it('parses integer pounds', () => {
    expect(parseAmountToCents('12')).toBe(1200);
  });
  it('parses two-decimal pounds', () => {
    expect(parseAmountToCents('12.50')).toBe(1250);
  });
  it('parses one-decimal pounds (treated as tenths)', () => {
    expect(parseAmountToCents('12.5')).toBe(1250);
  });
  it('parses comma decimal', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
  });
  it('strips currency symbol prefix', () => {
    expect(parseAmountToCents('£12.50')).toBe(1250);
    expect(parseAmountToCents('$ 5.00')).toBe(500);
  });
  it('rejects gibberish', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents('12.5.6')).toBeNull();
    expect(parseAmountToCents('12.,50')).toBeNull();
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats GBP with pound sign', () => {
    expect(formatCents(1250, 'GBP')).toBe('£12.50');
    expect(formatCents(0, 'GBP')).toBe('£0.00');
    expect(formatCents(50, 'GBP')).toBe('£0.50');
  });
  it('uses the iso code for unknown currencies', () => {
    expect(formatCents(1000, 'CHF')).toBe('CHF 10.00');
  });
  it('handles negative cents (used for net totals)', () => {
    expect(formatCents(-1250, 'GBP')).toBe('-£12.50');
  });
});

describe('advanceCadence', () => {
  it('advances monthly preserving day-of-month when valid', () => {
    expect(advanceCadence('2026-04-15', 'monthly')).toBe('2026-05-15');
  });
  it('clamps day of month at end of month', () => {
    expect(advanceCadence('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('advances weekly by 7 days', () => {
    expect(advanceCadence('2026-04-01', 'weekly')).toBe('2026-04-08');
  });
  it('advances fortnightly by 14 days', () => {
    expect(advanceCadence('2026-04-01', 'fortnightly')).toBe('2026-04-15');
  });
  it('rolls over the year on monthly Dec → Jan', () => {
    expect(advanceCadence('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
});

describe('settings + categories', () => {
  it('defaults currency to GBP and persists user choice', async () => {
    const db = new MemoryLocalDb();
    expect(await getCurrency(db)).toBe('GBP');
    await setCurrency(db, 'EUR');
    expect(await getCurrency(db)).toBe('EUR');
    // Idempotent overwrite.
    await setCurrency(db, 'USD');
    expect(await getCurrency(db)).toBe('USD');
  });

  it('seeds default categories once, then no-ops', async () => {
    const db = new MemoryLocalDb();
    const first = await seedDefaultCategories(db);
    expect(first.seeded).toBe(true);
    const cats = await listCategories(db);
    expect(cats.map((c) => c.label)).toEqual(['Food', 'Transport', 'Bills', 'Other']);
    const second = await seedDefaultCategories(db);
    expect(second.seeded).toBe(false);
  });

  it('detaches entries when a category is deleted (preserves data)', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    const e = await createEntry(db, {
      kind: 'spend',
      amount_cents: 500,
      category_id: food.id,
      occurred_on: '2026-04-10',
    });
    await deleteCategory(db, food.id);
    const all = await listEntries(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(e.id);
    expect(all[0]!.category_id).toBeNull();
  });
});

describe('entries + aggregates', () => {
  it('inserts an entry, queries it back by month, and rejects bad amounts', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 1250,
      category_id: food.id,
      note: 'Groceries',
      occurred_on: '2026-04-10',
    });
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 800,
      category_id: food.id,
      occurred_on: '2026-04-11',
    });
    // Out of range — March entry should not appear in April list.
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 9999,
      category_id: food.id,
      occurred_on: '2026-03-30',
    });
    const april = await listEntriesForMonth(db, 2026, 4);
    expect(april).toHaveLength(2);

    expect(() =>
      createEntry(db, {
        kind: 'spend',
        amount_cents: Number.NaN,
        category_id: food.id,
      }),
    ).toThrow();
  });

  it('aggregates spend/income/net by category for the current month', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    const transport = await addCategory(db, 'Transport');
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 1000,
      category_id: food.id,
      occurred_on: '2026-04-01',
    });
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 500,
      category_id: food.id,
      occurred_on: '2026-04-15',
    });
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 300,
      category_id: transport.id,
      occurred_on: '2026-04-15',
    });
    await createEntry(db, {
      kind: 'income',
      amount_cents: 200000,
      category_id: null,
      occurred_on: '2026-04-25',
    });
    const totals = await monthTotals(db, 2026, 4);
    expect(totals.spend_cents).toBe(1800);
    expect(totals.income_cents).toBe(200000);
    expect(totals.net_cents).toBe(198200);
    // by_category sorted by spend desc
    expect(totals.by_category[0]!.label).toBe('Food');
    expect(totals.by_category[0]!.spend_cents).toBe(1500);
    const transportRow = totals.by_category.find((c) => c.label === 'Transport');
    expect(transportRow?.spend_cents).toBe(300);
    const uncategorisedRow = totals.by_category.find((c) => c.label === 'Uncategorised');
    expect(uncategorisedRow?.income_cents).toBe(200000);
  });

  it('aggregateByCategory is pure on its inputs', () => {
    const totals = aggregateByCategory(
      [
        {
          id: 'a',
          kind: 'spend',
          amount_cents: 100,
          currency: 'GBP',
          category_id: 'c1',
          occurred_on: '2026-04-01',
        },
        {
          id: 'b',
          kind: 'income',
          amount_cents: 5000,
          currency: 'GBP',
          category_id: null,
          occurred_on: '2026-04-02',
        },
      ],
      [{ id: 'c1', label: 'Food', sort_order: 0 }],
    );
    expect(totals.spend_cents).toBe(100);
    expect(totals.income_cents).toBe(5000);
    expect(totals.net_cents).toBe(4900);
  });
});

describe('recurring', () => {
  it('lists recurring as due when next_due ≤ today', async () => {
    const db = new MemoryLocalDb();
    const r = await createRecurring(db, {
      kind: 'spend',
      amount_cents: 9900,
      cadence: 'monthly',
      next_due: '2026-04-01',
      note: 'Rent',
    });
    const due = await dueRecurring(db, '2026-04-15');
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe(r.id);
    // Nothing due if as-of is before next_due.
    const notDue = await dueRecurring(db, '2026-03-15');
    expect(notDue).toHaveLength(0);
  });

  it('applyRecurringNow inserts an entry and advances next_due', async () => {
    const db = new MemoryLocalDb();
    const r = await createRecurring(db, {
      kind: 'spend',
      amount_cents: 9900,
      cadence: 'monthly',
      next_due: '2026-04-01',
      note: 'Rent',
    });
    await applyRecurringNow(db, r, '2026-04-02');
    const entries = await listEntries(db);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount_cents).toBe(9900);
    expect(entries[0]!.note).toBe('Rent');
    expect(entries[0]!.occurred_on).toBe('2026-04-02');

    const stillDue = await dueRecurring(db, '2026-04-15');
    // Advanced to May 1st — not due on Apr 15.
    expect(stillDue).toHaveLength(0);
    const dueInMay = await dueRecurring(db, '2026-05-02');
    expect(dueInMay).toHaveLength(1);
  });
});

describe('CSV export', () => {
  it('produces date,kind,amount,currency,category,note header + rows', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 1250,
      category_id: food.id,
      note: 'Groceries',
      occurred_on: '2026-04-10',
    });
    await createEntry(db, {
      kind: 'income',
      amount_cents: 200000,
      category_id: null,
      note: null,
      occurred_on: '2026-04-25',
    });
    const entries = await listEntries(db);
    const cats = await listCategories(db);
    const csv = entriesToCsv(entries, cats);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,kind,amount,currency,category,note');
    // Sorted by occurred_on desc — Apr 25 first.
    expect(lines[1]).toBe('2026-04-25,income,2000.00,GBP,,');
    expect(lines[2]).toBe('2026-04-10,spend,12.50,GBP,Food,Groceries');
  });

  it('escapes commas, quotes, and newlines per RFC 4180', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 500,
      category_id: food.id,
      note: 'Lunch, coffee, and a "pastry"',
      occurred_on: '2026-04-10',
    });
    const entries = await listEntries(db);
    const cats = await listCategories(db);
    const csv = entriesToCsv(entries, cats);
    const lines = csv.split('\n');
    // The note should be quoted with the inner " doubled.
    expect(lines[1]).toContain('"Lunch, coffee, and a ""pastry"""');
  });

  it('exposes a typed shape via entriesToCsvRows', async () => {
    const db = new MemoryLocalDb();
    const food = await addCategory(db, 'Food');
    await createEntry(db, {
      kind: 'spend',
      amount_cents: 750,
      category_id: food.id,
      note: 'Milk',
      occurred_on: '2026-04-10',
    });
    const entries = await listEntries(db);
    const cats = await listCategories(db);
    const rows = entriesToCsvRows(entries, cats);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: '2026-04-10',
      kind: 'spend',
      amount: '7.50',
      currency: 'GBP',
      category: 'Food',
      note: 'Milk',
    });
  });
});
