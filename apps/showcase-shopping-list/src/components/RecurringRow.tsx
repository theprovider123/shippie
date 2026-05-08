/**
 * One row in the Recurring page. Cadence is editable inline; pause
 * toggles auto-queueing.
 */
import { useState } from 'react';
import type { RecurringSpec } from '../lib/types.ts';
import { nextDueLabel } from '../lib/recurring.ts';

interface RecurringRowProps {
  spec: RecurringSpec;
  now: number;
  onCadence: (id: string, days: number) => void;
  onPause: (id: string, paused: boolean) => void;
  onRemove: (id: string) => void;
}

export function RecurringRow({ spec, now, onCadence, onPause, onRemove }: RecurringRowProps) {
  const [draft, setDraft] = useState(String(spec.cadenceDays));
  return (
    <li className={`recurring-row${spec.paused ? ' paused' : ''}`}>
      <span className="name">{spec.name}</span>
      <label className="cadence">
        every
        <input
          type="number"
          min={1}
          max={90}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number.parseInt(draft, 10);
            if (Number.isFinite(n) && n >= 1) onCadence(spec.id, n);
            else setDraft(String(spec.cadenceDays));
          }}
        />
        days
      </label>
      <span className="due">{nextDueLabel(spec, now)}</span>
      <button
        type="button"
        className="ghost"
        onClick={() => onPause(spec.id, !spec.paused)}
        aria-pressed={spec.paused === true}
      >
        {spec.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" className="ghost danger" onClick={() => onRemove(spec.id)}>
        Remove
      </button>
    </li>
  );
}
