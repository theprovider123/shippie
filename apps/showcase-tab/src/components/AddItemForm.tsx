import { useMemo, useState } from 'react';
import { parseCents } from '../lib/currency.ts';

interface Member {
  id: string;
  name: string;
}

interface Props {
  members: Member[];
  myMemberId: string;
  currency: string;
  onAdd: (input: { label: string; amount_cents: number; paid_by: string; split_among: string[] }) => void;
}

export function AddItemForm({ members, myMemberId, currency, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string>(myMemberId);
  // empty Set === "split among everyone" (canonical default)
  const [splitOverride, setSplitOverride] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState<'all' | 'custom'>('all');

  const parsed = useMemo(() => parseCents(amountText), [amountText]);
  const canSubmit = parsed !== null && parsed > 0 && label.trim().length > 0 && members.length > 0;

  function reset() {
    setLabel('');
    setAmountText('');
    setSplitMode('all');
    setSplitOverride(new Set());
  }

  function toggleSplit(memberId: string) {
    const next = new Set(splitOverride);
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    setSplitOverride(next);
  }

  function submit() {
    if (!canSubmit || parsed === null) return;
    const split_among = splitMode === 'custom' ? Array.from(splitOverride) : [];
    onAdd({
      label: label.trim(),
      amount_cents: parsed,
      paid_by: paidBy,
      split_among,
    });
    reset();
  }

  return (
    <div className="tab-add-item">
      <div className="tab-field">
        <label className="tab-field-label">What</label>
        <input
          className="tab-input"
          placeholder="dinner, wine, taxi…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="tab-field">
        <label className="tab-field-label">How much ({currency})</label>
        <input
          className="tab-input tab-input-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
      </div>

      <div className="tab-field">
        <label className="tab-field-label">Who paid</label>
        <div className="tab-paid-by-row">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="tab-paid-by-chip"
              data-active={paidBy === m.id}
              onClick={() => setPaidBy(m.id)}
            >
              {m.id === myMemberId ? `${m.name} (you)` : m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-field">
        <label className="tab-field-label">Split among</label>
        <div className="tab-split-among">
          <div className="tab-paid-by-row">
            <button
              type="button"
              className="tab-paid-by-chip"
              data-active={splitMode === 'all'}
              onClick={() => setSplitMode('all')}
            >
              Everyone
            </button>
            <button
              type="button"
              className="tab-paid-by-chip"
              data-active={splitMode === 'custom'}
              onClick={() => setSplitMode('custom')}
            >
              Just some of us
            </button>
          </div>
          {splitMode === 'custom' ? (
            <div className="tab-split-among-row">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="tab-paid-by-chip"
                  data-active={splitOverride.has(m.id)}
                  onClick={() => toggleSplit(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="tab-btn tab-btn-primary tab-btn-block"
        disabled={!canSubmit}
        onClick={submit}
      >
        Add to the tab
      </button>
    </div>
  );
}
