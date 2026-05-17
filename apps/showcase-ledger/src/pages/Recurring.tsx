import { useEffect, useState } from 'react';
import { CategoryPicker } from '../components/CategoryPicker.tsx';
import { MoneyInput } from '../components/MoneyInput.tsx';
import {
  applyRecurringNow,
  createRecurring,
  deleteRecurring,
  formatCents,
  listRecurring,
  setRecurringActive,
  toIsoDate,
  updateRecurring,
} from '../db/queries.ts';
import type { Cadence, Category, EntryKind, Recurring as RecurringRow } from '../db/schema.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface RecurringProps {
  db: ShippieLocalDb;
  categories: ReadonlyArray<Category>;
  currency: string;
  refreshKey: number;
  onChanged(): void;
  onToast(message: string): void;
}

interface DraftState {
  kind: EntryKind;
  amountCents: number | null;
  categoryId: string | null;
  note: string;
  cadence: Cadence;
  nextDue: string;
}

function emptyDraft(): DraftState {
  return {
    kind: 'spend',
    amountCents: null,
    categoryId: null,
    note: '',
    cadence: 'monthly',
    nextDue: toIsoDate(new Date()),
  };
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
};

export function Recurring({
  db,
  categories,
  currency,
  refreshKey,
  onChanged,
  onToast,
}: RecurringProps) {
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editingCadenceId, setEditingCadenceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await listRecurring(db);
      if (!cancelled) setRows([...all].sort((a, b) => a.next_due.localeCompare(b.next_due)));
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  async function handleApply(row: RecurringRow) {
    await applyRecurringNow(db, row);
    onChanged();
    onToast(`Applied ${formatCents(row.amount_cents, row.currency)} (${row.note ?? CADENCE_LABEL[row.cadence]}).`);
  }

  async function handleStop(row: RecurringRow) {
    await setRecurringActive(db, row.id, row.active === 0);
    onChanged();
  }

  async function handleDelete(row: RecurringRow) {
    await deleteRecurring(db, row.id);
    onChanged();
  }

  async function handleCadenceChange(row: RecurringRow, cadence: Cadence) {
    await updateRecurring(db, row.id, { cadence });
    setEditingCadenceId(null);
    onChanged();
  }

  async function handleSaveDraft() {
    if (!draft || draft.amountCents === null || draft.amountCents <= 0) return;
    await createRecurring(db, {
      kind: draft.kind,
      amount_cents: draft.amountCents,
      category_id: draft.categoryId,
      note: draft.note.trim() || null,
      cadence: draft.cadence,
      next_due: draft.nextDue,
    });
    setDraft(null);
    onChanged();
    onToast('Recurring template added.');
  }

  if (draft) {
    return (
      <section className="page">
        <header className="page-header">
          <h2>New recurring</h2>
          <button type="button" className="ghost" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </header>

        <div className="kind-toggle" role="tablist" aria-label="Entry kind">
          <button
            type="button"
            role="tab"
            aria-selected={draft.kind === 'spend'}
            className={`spend${draft.kind === 'spend' ? ' active' : ''}`}
            onClick={() => setDraft({ ...draft, kind: 'spend' })}
          >
            Spending
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={draft.kind === 'income'}
            className={`income${draft.kind === 'income' ? ' active' : ''}`}
            onClick={() => setDraft({ ...draft, kind: 'income' })}
          >
            Income
          </button>
        </div>

        <MoneyInput
          valueCents={draft.amountCents}
          onChange={(c) => setDraft({ ...draft, amountCents: c })}
          currency={currency}
          autoFocus
        />

        <CategoryPicker
          categories={categories}
          value={draft.categoryId}
          onChange={(id) => setDraft({ ...draft, categoryId: id })}
        />

        <div className="field-row">
          <div className="field">
            <label htmlFor="recur-note">Note</label>
            <input
              id="recur-note"
              type="text"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Rent, Salary, Gym membership…"
              maxLength={120}
            />
          </div>
          <div className="field">
            <label htmlFor="recur-cadence">Cadence</label>
            <select
              id="recur-cadence"
              value={draft.cadence}
              onChange={(e) =>
                setDraft({ ...draft, cadence: e.target.value as Cadence })
              }
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="recur-next">Next due</label>
          <input
            id="recur-next"
            type="date"
            value={draft.nextDue}
            onChange={(e) => setDraft({ ...draft, nextDue: e.target.value })}
          />
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={draft.amountCents === null || draft.amountCents <= 0}
            onClick={handleSaveDraft}
          >
            Save
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Templates</span>
          </div>
          <h1>Recurring</h1>
        </div>
        <button type="button" className="primary" onClick={() => setDraft(emptyDraft())}>
          + New
        </button>
      </header>

      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        Recurring templates don't run on a schedule. When the next due date passes, Ledger surfaces a banner — you tap apply.
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">No recurring templates.</div>
      ) : (
        <div className="recurring-list">
          {rows.map((r) => {
            const labelById = new Map(categories.map((c) => [c.id, c.label]));
            const category = r.category_id
              ? labelById.get(r.category_id) ?? 'Removed category'
              : 'Uncategorised';
            const isStopped = r.active === 0;
            return (
              <div className={`recurring-card${isStopped ? ' stopped' : ''}`} key={r.id}>
                <div className="row">
                  <div>
                    <div style={{ fontSize: 15 }}>{r.note?.trim() || category}</div>
                    <div className="meta">
                      {category} · {r.kind === 'spend' ? 'spending' : 'income'} · next {r.next_due}
                    </div>
                  </div>
                  <span className="amount">
                    {r.kind === 'spend' ? '−' : '+'}
                    {formatCents(r.amount_cents, r.currency)}
                  </span>
                </div>

                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>Cadence</label>
                    {editingCadenceId === r.id ? (
                      <select
                        value={r.cadence}
                        onChange={(e) =>
                          handleCadenceChange(r, e.target.value as Cadence)
                        }
                      >
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setEditingCadenceId(r.id)}
                      >
                        {CADENCE_LABEL[r.cadence]} (edit)
                      </button>
                    )}
                  </div>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={isStopped}
                    onClick={() => handleApply(r)}
                  >
                    Apply now
                  </button>
                  <button type="button" onClick={() => handleStop(r)}>
                    {isStopped ? 'Resume' : 'Stop'}
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(r)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
