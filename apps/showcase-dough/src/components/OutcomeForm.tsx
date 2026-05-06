import { useState } from 'react';
import type { BakeOutcome } from '../db.ts';

interface Props {
  initial?: BakeOutcome | null;
  onSubmit: (outcome: BakeOutcome) => void;
  onCancel: () => void;
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="outcome-row">
      <span className="outcome-label">{label}</span>
      <div className="rate-row" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`star ${n <= value ? 'on' : ''}`}
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} of 5`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function OutcomeForm({ initial, onSubmit, onCancel }: Props) {
  const [crumb, setCrumb] = useState<number>(initial?.crumb_rating ?? 0);
  const [crust, setCrust] = useState<number>(initial?.crust_rating ?? 0);
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [photo, setPhoto] = useState<string>(initial?.photo_url ?? '');

  function submit() {
    if (crumb === 0 && crust === 0 && notes.trim() === '') return;
    const outcome: BakeOutcome = {
      crumb_rating: Math.max(1, crumb),
      crust_rating: Math.max(1, crust),
      notes: notes.trim(),
      photo_url: photo.trim() || undefined,
      logged_at: new Date().toISOString(),
    };
    onSubmit(outcome);
  }

  return (
    <div className="outcome-form">
      <p className="eyebrow">log this bake</p>
      <StarRow label="Crumb" value={crumb} onChange={setCrumb} />
      <StarRow label="Crust" value={crust} onChange={setCrust} />
      <label className="field">
        <span>notes</span>
        <textarea
          value={notes}
          rows={3}
          placeholder="What worked, what to change next time…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label className="field">
        <span>photo URL (optional)</span>
        <input
          type="url"
          value={photo}
          placeholder="https://…"
          onChange={(e) => setPhoto(e.target.value)}
        />
      </label>
      <div className="outcome-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={submit}
          disabled={crumb === 0 && crust === 0 && notes.trim() === ''}
        >
          Save bake
        </button>
      </div>
    </div>
  );
}
