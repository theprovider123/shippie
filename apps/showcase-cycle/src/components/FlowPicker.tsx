/**
 * FlowPicker — one row of five buttons. 0 (none) to 4 (heavy). Voice
 * doc: medical-clear words, no euphemisms.
 */
import { FLOW_LABELS, type Flow } from '../db/schema.ts';

export interface FlowPickerProps {
  value: Flow | null;
  onChange: (next: Flow) => void;
}

const FLOWS: Flow[] = [0, 1, 2, 3, 4];

export function FlowPicker({ value, onChange }: FlowPickerProps) {
  return (
    <fieldset className="flow-picker" aria-label="Flow today">
      <legend>Flow</legend>
      <div className="flow-row">
        {FLOWS.map((f) => (
          <button
            key={f}
            type="button"
            className={value === f ? 'flow-cell active' : 'flow-cell'}
            aria-pressed={value === f}
            onClick={() => onChange(f)}
          >
            <span className="flow-bars" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className={i < f ? 'bar on' : 'bar'} />
              ))}
            </span>
            <small>{FLOW_LABELS[f]}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
