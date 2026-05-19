/**
 * Group detail page — expense list, add-expense form, settle-up card,
 * and "share group" link generator.
 *
 * MVP equal-split: every expense divides evenly across the members
 * listed in `split_among`. Custom shares are a follow-up.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  computeBalances,
  createGroupExpense,
  deleteGroupExpense,
  listExpensesForGroup,
} from '../db/groups-queries.ts';
import type { Group, GroupExpense } from '../db/groups-schema.ts';
import { SUPPORTED_CURRENCIES, convertCents, formatMoney } from '../lib/fx.ts';
import { settleUp } from '../lib/settle-up.ts';
import { buildGroupShare } from '../share/group-share.ts';

export interface GroupDetailProps {
  db: ShippieLocalDb;
  group: Group;
  onBack(): void;
  onToast(message: string): void;
}

interface ExpenseDraft {
  amountText: string;
  currency: string;
  paid_by_id: string;
  note: string;
  occurred_on: string;
  split_among: Set<string>;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(group: Group): ExpenseDraft {
  return {
    amountText: '',
    currency: group.base_currency,
    paid_by_id: group.members.find((m) => m.is_me)?.id ?? group.members[0]?.id ?? '',
    note: '',
    occurred_on: isoToday(),
    split_among: new Set(group.members.map((m) => m.id)),
  };
}

function parseCents(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,-]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

export function GroupDetail({ db, group, onBack, onToast }: GroupDetailProps) {
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listExpensesForGroup(db, group.id);
      if (!cancelled) setExpenses(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, group.id, refresh]);

  const balances = useMemo(() => computeBalances(group, expenses), [group, expenses]);
  const transfers = useMemo(() => settleUp(balances), [balances]);
  const me = group.members.find((m) => m.is_me);
  const myBalance = me ? balances.find((b) => b.memberId === me.id)?.cents ?? 0 : 0;
  const memberName = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?';

  async function saveExpense() {
    if (!draft) return;
    const cents = parseCents(draft.amountText);
    if (cents === null || draft.split_among.size === 0) return;
    await createGroupExpense(db, {
      group_id: group.id,
      paid_by_id: draft.paid_by_id,
      amount_cents: cents,
      currency: draft.currency,
      note: draft.note.trim() || null,
      occurred_on: draft.occurred_on,
      split_among: Array.from(draft.split_among),
    });
    setDraft(null);
    setRefresh((n) => n + 1);
    onToast('Expense added.');
  }

  async function remove(expense: GroupExpense) {
    if (!window.confirm(`Remove ${formatMoney(expense.amount_cents, expense.currency)}?`)) return;
    await deleteGroupExpense(db, expense.id);
    setRefresh((n) => n + 1);
    onToast('Expense removed.');
  }

  async function share() {
    const { url } = await buildGroupShare(group, expenses);
    setShareUrl(url);
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ url, title: `${group.name} on Ledger` });
        return;
      } catch {
        /* user cancelled — fall back to copy below */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      onToast('Share link copied to clipboard.');
    } catch {
      onToast('Share link ready. Long-press to copy.');
    }
  }

  if (draft) {
    return (
      <section className="page">
        <header className="page-header">
          <button type="button" className="ghost back" onClick={() => setDraft(null)}>
            ← Cancel
          </button>
          <h1>Add expense</h1>
        </header>

        <div className="group-form">
          <label className="field">
            <span>Paid for</span>
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Dinner at Cervejaria"
              autoFocus
            />
          </label>

          <div className="row split">
            <label className="field grow">
              <span>Amount</span>
              <input
                inputMode="decimal"
                type="text"
                value={draft.amountText}
                onChange={(e) => setDraft({ ...draft, amountText: e.target.value })}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span>Currency</span>
              <select
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Paid by</span>
            <select
              value={draft.paid_by_id}
              onChange={(e) => setDraft({ ...draft, paid_by_id: e.target.value })}
            >
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>{m.is_me ? `${m.name} (me)` : m.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={draft.occurred_on}
              onChange={(e) => setDraft({ ...draft, occurred_on: e.target.value })}
            />
          </label>

          <fieldset className="field">
            <legend>Split among</legend>
            <div className="split-chips">
              {group.members.map((m) => {
                const on = draft.split_among.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`chip ${on ? 'chip-on' : ''}`}
                    onClick={() => {
                      const next = new Set(draft.split_among);
                      if (on) next.delete(m.id); else next.add(m.id);
                      setDraft({ ...draft, split_among: next });
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
            <small className="muted">
              {draft.split_among.size > 0 && draft.amountText
                ? `Each splitter owes ~${formatMoney(
                    Math.round((parseCents(draft.amountText) ?? 0) / draft.split_among.size),
                    draft.currency,
                  )}`
                : 'Pick at least one splitter.'}
            </small>
          </fieldset>

          <div className="actions">
            <button type="button" className="ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={saveExpense}
              disabled={!draft.amountText.trim() || draft.split_among.size === 0}
            >
              Save expense
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="ghost back" onClick={onBack}>
          ← Groups
        </button>
        <div>
          <div className="eyebrow-row">
            <span>Group · settles in {group.base_currency}</span>
          </div>
          <h1>{group.name}</h1>
          <p className="muted">
            {group.members.length} {group.members.length === 1 ? 'member' : 'members'} ·{' '}
            {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
          </p>
        </div>
      </header>

      <section className="balance-card">
        {me ? (
          <div className="balance-headline">
            {myBalance > 1 ? (
              <>
                <strong className="numeric pos">{formatMoney(myBalance, group.base_currency)}</strong>
                <span>you are owed</span>
              </>
            ) : myBalance < -1 ? (
              <>
                <strong className="numeric neg">{formatMoney(-myBalance, group.base_currency)}</strong>
                <span>you owe</span>
              </>
            ) : (
              <>
                <strong className="numeric">{formatMoney(0, group.base_currency)}</strong>
                <span>all square</span>
              </>
            )}
          </div>
        ) : null}

        {transfers.length > 0 ? (
          <ul className="settle-list">
            {transfers.map((t, index) => (
              <li key={index}>
                <strong>{memberName(t.from)}</strong>
                <span>pays</span>
                <strong>{memberName(t.to)}</strong>
                <span className="numeric">{formatMoney(t.cents, group.base_currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{expenses.length > 0 ? 'Everyone is settled.' : 'Add an expense to start.'}</p>
        )}
      </section>

      <div className="group-actions">
        <button type="button" className="primary" onClick={() => setDraft(emptyDraft(group))}>
          + Add expense
        </button>
        <button type="button" className="ghost" onClick={() => void share()}>
          ↗ Share group
        </button>
      </div>

      {shareUrl ? (
        <p className="share-url-card">
          <code>{shareUrl}</code>
        </p>
      ) : null}

      {expenses.length > 0 ? (
        <ul className="expense-list">
          {expenses.map((e) => {
            const inBase = convertCents(e.amount_cents, e.currency, group.base_currency);
            return (
              <li key={e.id}>
                <div>
                  <strong>{e.note || 'Expense'}</strong>
                  <small>
                    {memberName(e.paid_by_id)} paid · split {e.split_among.length} ways · {e.occurred_on}
                  </small>
                </div>
                <div className="amounts">
                  <strong className="numeric">{formatMoney(e.amount_cents, e.currency)}</strong>
                  {e.currency !== group.base_currency ? (
                    <small className="muted">≈ {formatMoney(inBase, group.base_currency)}</small>
                  ) : null}
                </div>
                <button type="button" className="ghost" onClick={() => void remove(e)} aria-label="Remove expense">×</button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
