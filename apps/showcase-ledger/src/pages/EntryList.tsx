import { useEffect, useMemo, useState } from 'react';
import { CategoryPicker } from '../components/CategoryPicker.tsx';
import { EntryRow } from '../components/EntryRow.tsx';
import { MoneyInput } from '../components/MoneyInput.tsx';
import {
  applyRecurringNow,
  createEntry,
  deleteEntry,
  dueRecurring,
  formatCents,
  listEntriesForMonth,
  monthTotals,
  toIsoDate,
} from '../db/queries.ts';
import type { Category, Entry, EntryKind, Recurring } from '../db/schema.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface EntryListProps {
  db: ShippieLocalDb;
  year: number;
  month: number;
  onMonthChange(year: number, month: number): void;
  categories: ReadonlyArray<Category>;
  refreshKey: number;
  onChanged(): void;
  onEntryCreated(entry: Entry): void;
  onToast(message: string): void;
}

interface DraftState {
  kind: EntryKind;
  amountCents: number | null;
  categoryId: string | null;
  note: string;
  occurredOn: string;
  initialAmountText?: string;
}

function emptyDraft(): DraftState {
  return {
    kind: 'spend',
    amountCents: null,
    categoryId: null,
    note: '',
    occurredOn: toIsoDate(new Date()),
  };
}

export function EntryList({
  db,
  year,
  month,
  onMonthChange,
  categories,
  refreshKey,
  onChanged,
  onEntryCreated,
  onToast,
}: EntryListProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState({ spend_cents: 0, income_cents: 0, net_cents: 0 });
  const [due, setDue] = useState<Recurring[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [es, t, d] = await Promise.all([
        listEntriesForMonth(db, year, month),
        monthTotals(db, year, month),
        dueRecurring(db),
      ]);
      if (cancelled) return;
      setEntries(es);
      setTotals({
        spend_cents: t.spend_cents,
        income_cents: t.income_cents,
        net_cents: t.net_cents,
      });
      setDue(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, year, month, refreshKey]);

  const grouped = useMemo(() => groupByDay(entries), [entries]);
  const currency = entries[0]?.currency ?? 'GBP';
  const monthLabel = formatMonthLabel(year, month);
  const isCurrentMonth = isSameMonthAsToday(year, month);

  function startDraft(kind: EntryKind) {
    setDraft({ ...emptyDraft(), kind });
  }

  async function saveDraft() {
    if (!draft || draft.amountCents === null || draft.amountCents <= 0) return;
    setSaving(true);
    try {
      const entry = await createEntry(db, {
        kind: draft.kind,
        amount_cents: draft.amountCents,
        category_id: draft.categoryId,
        note: draft.note.trim() || null,
        occurred_on: draft.occurredOn,
      });
      setDraft(null);
      onChanged();
      onEntryCreated(entry);
      onToast(
        `${entry.kind === 'spend' ? 'Logged spending' : 'Logged income'} ${formatCents(
          entry.amount_cents,
          entry.currency,
        )}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteEntry(db, id);
    onChanged();
  }

  async function applyAllDue() {
    for (const r of due) {
      await applyRecurringNow(db, r);
    }
    onChanged();
    onToast(`Applied ${due.length} recurring ${due.length === 1 ? 'entry' : 'entries'}.`);
  }

  function navMonth(delta: number) {
    let nm = month + delta;
    let ny = year;
    while (nm > 12) {
      nm -= 12;
      ny += 1;
    }
    while (nm < 1) {
      nm += 12;
      ny -= 1;
    }
    onMonthChange(ny, nm);
  }

  if (draft) {
    return (
      <DraftEditor
        draft={draft}
        currency={currency}
        categories={categories}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={saveDraft}
        saving={saving}
      />
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Ledger</span>
          </div>
          <h1>{monthLabel}</h1>
        </div>
        <div className="month-nav" role="group" aria-label="Change month">
          <button type="button" onClick={() => navMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <button
            type="button"
            onClick={() => navMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="totals-strip" aria-label="Month totals">
        <div>
          <span className="label">Spent</span>
          <span className="value">{formatCents(totals.spend_cents, currency)}</span>
        </div>
        <div>
          <span className="label">Received</span>
          <span className="value positive">{formatCents(totals.income_cents, currency)}</span>
        </div>
        <div>
          <span className="label">Net</span>
          <span
            className={`value ${
              totals.net_cents < 0 ? 'negative' : totals.net_cents > 0 ? 'positive' : ''
            }`}
          >
            {formatCents(totals.net_cents, currency)}
          </span>
        </div>
      </div>

      {due.length > 0 ? (
        <div className="banner" role="status">
          <span>
            {due.length} recurring {due.length === 1 ? 'entry is' : 'entries are'} due — apply?
          </span>
          <button type="button" onClick={applyAllDue}>
            Apply all
          </button>
        </div>
      ) : null}

      <div className="actions">
        <button type="button" className="primary" onClick={() => startDraft('spend')}>
          + Log spending
        </button>
        <button type="button" onClick={() => startDraft('income')}>
          + Log income
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">No entries this month.</div>
      ) : (
        <div className="day-list">
          {grouped.map((g) => (
            <div className="day-group" key={g.date}>
              <div className="day-heading">
                <span>{formatDayHeading(g.date)}</span>
                <span className="day-net">{formatCents(g.net_cents, currency)}</span>
              </div>
              {g.entries.map((e) => (
                <EntryRow key={e.id} entry={e} categories={categories} onDelete={handleDelete} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="privacy-note">
        Ledger has no servers. Numbers stay on this phone. CSV export is the product.
      </div>
    </section>
  );
}

interface DraftEditorProps {
  draft: DraftState;
  currency: string;
  categories: ReadonlyArray<Category>;
  onChange(next: DraftState): void;
  onCancel(): void;
  onSave(): void;
  saving: boolean;
}

function DraftEditor({
  draft,
  currency,
  categories,
  onChange,
  onCancel,
  onSave,
  saving,
}: DraftEditorProps) {
  const verb = draft.kind === 'spend' ? 'Log spending' : 'Log income';
  const canSave = draft.amountCents !== null && draft.amountCents > 0 && !saving;
  return (
    <section className="page">
      <header className="page-header">
        <h2>{verb}</h2>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <div className="kind-toggle" role="tablist" aria-label="Entry kind">
        <button
          type="button"
          role="tab"
          aria-selected={draft.kind === 'spend'}
          className={`spend${draft.kind === 'spend' ? ' active' : ''}`}
          onClick={() => onChange({ ...draft, kind: 'spend' })}
        >
          Spending
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={draft.kind === 'income'}
          className={`income${draft.kind === 'income' ? ' active' : ''}`}
          onClick={() => onChange({ ...draft, kind: 'income' })}
        >
          Income
        </button>
      </div>

      <MoneyInput
        valueCents={draft.amountCents}
        onChange={(c) => onChange({ ...draft, amountCents: c })}
        currency={currency}
        autoFocus
        initialText={draft.initialAmountText}
      />

      <CategoryPicker
        categories={categories}
        value={draft.categoryId}
        onChange={(id) => onChange({ ...draft, categoryId: id })}
      />

      <div className="field-row">
        <div className="field">
          <label htmlFor="entry-note">Note</label>
          <input
            id="entry-note"
            type="text"
            value={draft.note}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            placeholder="Groceries, train, pharmacy receipt…"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label htmlFor="entry-date">Date</label>
          <input
            id="entry-date"
            type="date"
            value={draft.occurredOn}
            max={toIsoDate(new Date())}
            onChange={(e) => onChange({ ...draft, occurredOn: e.target.value })}
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" className="primary" disabled={!canSave} onClick={onSave}>
          Save
        </button>
      </div>
    </section>
  );
}

interface DayGroup {
  date: string;
  entries: Entry[];
  net_cents: number;
}

function groupByDay(entries: ReadonlyArray<Entry>): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const e of entries) {
    let group = map.get(e.occurred_on);
    if (!group) {
      group = { date: e.occurred_on, entries: [], net_cents: 0 };
      map.set(e.occurred_on, group);
    }
    group.entries.push(e);
    group.net_cents += e.kind === 'income' ? e.amount_cents : -e.amount_cents;
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function formatMonthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return `${d.toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  })} ${year}`;
}

function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function isSameMonthAsToday(year: number, month: number): boolean {
  const today = new Date();
  return today.getFullYear() === year && today.getMonth() + 1 === month;
}
