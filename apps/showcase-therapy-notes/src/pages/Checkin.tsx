/**
 * Daily check-in. Mood (1-5), anxiety (1-5), sleep (hours), one line.
 * None of the fields are required. The user can save with one number
 * filled in or all four — both are fine. We don't gate.
 */
import { useState } from 'react';
import { createCheckin, localDateString } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';

interface CheckinProps {
  onSaved: (info: { mood: number | null; sleep: number | null }) => void;
  onCancel: () => void;
}

export function Checkin({ onSaved, onCancel }: CheckinProps) {
  const [mood, setMood] = useState<number | null>(null);
  const [anxiety, setAnxiety] = useState<number | null>(null);
  const [sleep, setSleep] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearable(setter: (n: number | null) => void, value: number | null, target: number): void {
    setter(value === target ? null : target);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const sleepHours = sleep.trim() === '' ? null : Number(sleep);
      await createCheckin(resolveLocalDb(), {
        occurred_on: localDateString(),
        mood_1to5: mood,
        anxiety_1to5: anxiety,
        sleep_hours: Number.isFinite(sleepHours) ? (sleepHours as number) : null,
        note: note.trim() || null,
      });
      onSaved({ mood, sleep: Number.isFinite(sleepHours) ? (sleepHours as number) : null });
    } catch {
      setError('Couldn\'t save just now. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = mood !== null || anxiety !== null || sleep.trim() !== '' || note.trim() !== '';

  return (
    <section className="page page-checkin" aria-label="Today">
      <header className="page-header">
        <h1>Today</h1>
        <p className="muted small">Skip anything that doesn't fit.</p>
      </header>

      <fieldset className="checkin-field">
        <legend>Mood</legend>
        <div className="scale-row" role="radiogroup" aria-label="Mood, 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={mood === n}
              className={`scale-button ${mood === n ? 'scale-button-on' : ''}`}
              onClick={() => clearable(setMood, mood, n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="checkin-field">
        <legend>Anxiety</legend>
        <div className="scale-row" role="radiogroup" aria-label="Anxiety, 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={anxiety === n}
              className={`scale-button ${anxiety === n ? 'scale-button-on' : ''}`}
              onClick={() => clearable(setAnxiety, anxiety, n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="checkin-field">
        <span className="field-prompt">Sleep, hours</span>
        <input
          type="number"
          className="text-input"
          inputMode="decimal"
          step="0.5"
          min={0}
          max={16}
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
        />
      </label>

      <label className="checkin-field">
        <span className="field-prompt">One line</span>
        <input
          type="text"
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {error ? <p className="error-line">{error}</p> : null}

      <div className="page-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
          Back
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={saving || !canSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
