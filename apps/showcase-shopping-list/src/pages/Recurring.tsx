/**
 * Recurring page — manage the staples that should auto-appear on a
 * cadence. Tapping "Add common staples" seeds a sensible default set;
 * users can also type their own.
 */
import { useState } from 'react';
import type { RecurringSpec } from '../lib/types.ts';
import { RecurringRow } from '../components/RecurringRow.tsx';
import {
  DEFAULT_RECURRING_STAPLES,
  addSpec,
  makeSpec,
  pauseSpec,
  removeSpec,
  setCadence,
} from '../lib/recurring.ts';

interface RecurringPageProps {
  specs: readonly RecurringSpec[];
  onChange: (specs: readonly RecurringSpec[]) => void;
  onBack: () => void;
}

export function RecurringPage({ specs, onChange, onBack }: RecurringPageProps) {
  const [draftName, setDraftName] = useState('');
  const [draftCadence, setDraftCadence] = useState('7');
  const now = Date.now();

  function add(name: string, cadenceDays: number) {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange(addSpec(specs, makeSpec({ name: trimmed, cadenceDays, now })));
  }

  function seedDefaults() {
    let next = specs;
    for (const seed of DEFAULT_RECURRING_STAPLES) {
      next = addSpec(next, makeSpec({ name: seed.name, cadenceDays: seed.cadenceDays, now }));
    }
    onChange(next);
  }

  return (
    <main>
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack} aria-label="Back to list">
          ← Back
        </button>
        <h1>Recurring</h1>
      </header>

      <p className="hint">Staples reappear on the list every N days unless paused.</p>

      {specs.length === 0 ? (
        <div className="empty-actions">
          <p className="empty">No recurring staples yet.</p>
          <button type="button" onClick={seedDefaults}>Add common staples</button>
        </div>
      ) : (
        <ul className="recurring-list">
          {specs.map((spec) => (
            <RecurringRow
              key={spec.id}
              spec={spec}
              now={now}
              onCadence={(id, days) => onChange(setCadence(specs, id, days))}
              onPause={(id, paused) => onChange(pauseSpec(specs, id, paused))}
              onRemove={(id) => onChange(removeSpec(specs, id))}
            />
          ))}
        </ul>
      )}

      <form
        className="add-recurring"
        onSubmit={(e) => {
          e.preventDefault();
          const cadence = Number.parseInt(draftCadence, 10);
          add(draftName, Number.isFinite(cadence) ? cadence : 7);
          setDraftName('');
        }}
      >
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="e.g. milk"
          aria-label="Staple name"
        />
        <input
          type="number"
          min={1}
          max={90}
          value={draftCadence}
          onChange={(e) => setDraftCadence(e.target.value)}
          aria-label="Cadence in days"
        />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
