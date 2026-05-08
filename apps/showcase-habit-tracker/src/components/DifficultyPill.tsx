import type { Difficulty } from '../types.ts';

const LABELS: Record<Difficulty, string> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
};

/**
 * Tiny pill that names the habit's difficulty. Read-only; the picker
 * lives in the habit edit surface.
 *
 * Voice-doc note: difficulty is descriptive, not aspirational. "Hard"
 * isn't a flex — it's a flag that says "expect to drop this on busy
 * weeks".
 */
export function DifficultyPill({ value }: { value: Difficulty }) {
  return <span className={`pill pill-${value}`}>{LABELS[value]}</span>;
}

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (next: Difficulty) => void;
}) {
  const opts: Difficulty[] = ['easy', 'medium', 'hard'];
  return (
    <div className="difficulty-picker" role="radiogroup" aria-label="Difficulty">
      {opts.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          className={`pill pill-${d} ${value === d ? 'pill-active' : ''}`}
          onClick={() => onChange(d)}
        >
          {LABELS[d]}
        </button>
      ))}
    </div>
  );
}
