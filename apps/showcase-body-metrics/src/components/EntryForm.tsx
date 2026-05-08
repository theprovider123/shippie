/**
 * Entry form — date + weight + optional body-fat (with method) + photo.
 *
 * The form is intentionally tiny. People log weight in 5 seconds in
 * the morning; anything heavier than that doesn't survive the
 * "I'll do it tomorrow" test.
 */
import { useId, useRef, useState } from 'react';
import type { BodyFatMethod, Entry } from '../lib/store.ts';
import { METHODS } from '../lib/bodyfat.ts';

interface EntryFormProps {
  defaultDate?: string;
  onLog: (entry: { entry: Omit<Entry, 'id'>; photoFile: File | null }) => Promise<void> | void;
}

export function EntryForm({ defaultDate, onLog }: EntryFormProps) {
  const photoInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [method, setMethod] = useState<BodyFatMethod>('scale');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = parseFloat(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) return;
    const bf = bodyFat ? parseFloat(bodyFat) : undefined;
    const photoFile = fileRef.current?.files?.[0] ?? null;
    setSubmitting(true);
    try {
      await onLog({
        entry: {
          date,
          weightKg,
          bodyFatPct: Number.isFinite(bf as number) ? bf : undefined,
          bodyFatMethod: bf !== undefined ? method : undefined,
          note: note.trim() || undefined,
        },
        photoFile,
      });
      setWeight('');
      setBodyFat('');
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="entry-form">
      <div className="row row--3">
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>Weight (kg)</span>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="74.0"
          />
        </label>
        <label>
          <span>Body fat %</span>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="optional"
          />
        </label>
      </div>
      {bodyFat && (
        <label className="method-row">
          <span>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as BodyFatMethod)}>
            {Object.values(METHODS).map((m) => (
              <option key={m.method} value={m.method}>
                {m.label} (±{m.typicalErrorPct}%)
              </option>
            ))}
          </select>
          <small className="caveat">{METHODS[method].caveat}</small>
        </label>
      )}
      <label>
        <span>Photo (stays on device)</span>
        <input id={photoInputId} ref={fileRef} type="file" accept="image/*" capture="user" />
      </label>
      <label>
        <span>Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. after a run; high salt yesterday"
          maxLength={140}
        />
      </label>
      <button type="submit" disabled={!weight || submitting}>
        {submitting ? 'Saving…' : 'Log'}
      </button>
    </form>
  );
}
