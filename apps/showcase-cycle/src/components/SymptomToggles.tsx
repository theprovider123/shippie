/**
 * SymptomToggles — chip-set with the symptoms the voice doc names
 * directly. Plain words, no euphemisms.
 */
import { SYMPTOM_KEYS, SYMPTOM_LABELS, type SymptomKey } from '../db/schema.ts';

export interface SymptomTogglesProps {
  selected: ReadonlyArray<SymptomKey>;
  onChange: (next: SymptomKey[]) => void;
}

export function SymptomToggles({ selected, onChange }: SymptomTogglesProps) {
  function toggle(key: SymptomKey): void {
    const set = new Set(selected);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange([...set]);
  }
  return (
    <fieldset className="symptom-toggles" aria-label="Symptoms today">
      <legend>Symptoms</legend>
      <div className="symptom-row">
        {SYMPTOM_KEYS.map((key) => {
          const on = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={on ? 'chip on' : 'chip'}
              aria-pressed={on}
              onClick={() => toggle(key)}
            >
              {SYMPTOM_LABELS[key]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
