import { useMemo } from 'react';
import {
  type FlourKind,
  type FlourPart,
  flourLabel,
  validateFlourMix,
} from '../lib/percentages.ts';

interface Props {
  flours: ReadonlyArray<FlourPart>;
  onChange: (next: FlourPart[]) => void;
}

const ALL_KINDS: FlourKind[] = [
  'bread',
  'all-purpose',
  '00',
  'whole-wheat',
  'rye',
  'spelt',
  'durum',
];

/**
 * Editable flour-mix list. Each row is a kind dropdown + a percentage
 * input. The mix must sum to 100 — `validateFlourMix` surfaces an
 * inline message until it does.
 */
export function FlourMix({ flours, onChange }: Props) {
  const error = useMemo(() => validateFlourMix(flours), [flours]);
  const sum = useMemo(
    () => flours.reduce((acc, f) => acc + f.pct, 0),
    [flours],
  );

  function update(idx: number, patch: Partial<FlourPart>) {
    const next = flours.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(flours.filter((_, i) => i !== idx));
  }

  function add() {
    const used = new Set(flours.map((f) => f.kind));
    const free = ALL_KINDS.find((k) => !used.has(k)) ?? 'bread';
    onChange([...flours, { kind: free, pct: 0 }]);
  }

  function normalize() {
    if (flours.length === 0) return;
    const totalPct = sum || 1;
    const next = flours.map((f) => ({
      ...f,
      pct: Math.round((f.pct * 100) / totalPct),
    }));
    // Patch rounding drift onto the first row.
    const drift = 100 - next.reduce((acc, f) => acc + f.pct, 0);
    if (next[0]) next[0] = { ...next[0], pct: next[0].pct + drift };
    onChange(next);
  }

  return (
    <div className="flour-mix">
      <ul>
        {flours.map((f, i) => (
          <li key={i}>
            <select
              value={f.kind}
              onChange={(e) => update(i, { kind: e.target.value as FlourKind })}
              aria-label={`Flour ${i + 1} kind`}
            >
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {flourLabel(k)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={f.pct}
              onChange={(e) =>
                update(i, { pct: Math.max(0, Number(e.target.value) || 0) })
              }
              aria-label={`Flour ${i + 1} percentage`}
            />
            <span className="flour-pct-suffix">%</span>
            <button
              type="button"
              className="flour-remove"
              onClick={() => remove(i)}
              aria-label={`Remove ${flourLabel(f.kind)}`}
              disabled={flours.length === 1}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flour-mix-actions">
        <button type="button" className="ghost" onClick={add}>
          + flour
        </button>
        {Math.abs(sum - 100) > 0.5 ? (
          <button type="button" className="ghost" onClick={normalize}>
            Normalize to 100%
          </button>
        ) : null}
        <span className={`flour-sum ${Math.abs(sum - 100) > 0.5 ? 'off' : 'ok'}`}>
          {sum.toFixed(0)}%
        </span>
      </div>
      {error ? <p className="warn-line">{error}</p> : null}
    </div>
  );
}
