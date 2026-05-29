/**
 * ChipScale — a labelled row of tap-chips for a single-select scale or enum
 * (pain, mood, energy, discharge, intimacy). Tapping the active chip again
 * clears it, so a mis-tap is a one-tap undo — part of keeping the daily log a
 * 5-second, low-friction action. Plain words, no euphemisms (VOICE.md).
 */
export interface ChipOption<V extends string | number> {
  value: V;
  label: string;
}

export interface ChipScaleProps<V extends string | number> {
  legend: string;
  options: ReadonlyArray<ChipOption<V>>;
  value: V | null;
  onChange: (next: V | null) => void;
  /** Optional hint shown under the legend (e.g. "optional"). */
  hint?: string;
}

export function ChipScale<V extends string | number>({
  legend,
  options,
  value,
  onChange,
  hint,
}: ChipScaleProps<V>) {
  return (
    <fieldset className="chip-scale" aria-label={legend}>
      <legend>
        {legend}
        {hint ? <span className="chip-scale-hint"> · {hint}</span> : null}
      </legend>
      <div className="chip-row">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              className={on ? 'chip selected' : 'chip'}
              aria-pressed={on}
              onClick={() => onChange(on ? null : opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multi-select variant (e.g. intimacy can be more than one note). */
export interface ChipMultiProps<V extends string> {
  legend: string;
  options: ReadonlyArray<ChipOption<V>>;
  selected: ReadonlyArray<V>;
  onChange: (next: V[]) => void;
  hint?: string;
}

export function ChipMulti<V extends string>({ legend, options, selected, onChange, hint }: ChipMultiProps<V>) {
  function toggle(v: V): void {
    const set = new Set(selected);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange([...set]);
  }
  return (
    <fieldset className="chip-scale" aria-label={legend}>
      <legend>
        {legend}
        {hint ? <span className="chip-scale-hint"> · {hint}</span> : null}
      </legend>
      <div className="chip-row">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={on ? 'chip selected' : 'chip'}
              aria-pressed={on}
              onClick={() => toggle(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
