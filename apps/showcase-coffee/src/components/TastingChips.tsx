import { TASTING_CHIPS } from '../lib/options.ts';

interface TastingChipsProps {
  value: string;
  onAppend: (next: string) => void;
}

/**
 * Suggested tasting-note chips. Tapping a chip appends it to the
 * existing free-text. The text input is the source of truth — chips
 * are just shortcuts for fingers.
 */
export function TastingChips({ value, onAppend }: TastingChipsProps) {
  return (
    <div className="tasting-chips" role="group" aria-label="Tasting note chips">
      {TASTING_CHIPS.map((chip) => {
        const present = value.toLowerCase().includes(chip.toLowerCase());
        return (
          <button
            key={chip}
            type="button"
            className={`tasting-chip ${present ? 'present' : ''}`}
            disabled={present}
            onClick={() => {
              const trimmed = value.trim();
              const next = trimmed.length === 0 ? chip : `${trimmed}, ${chip}`;
              onAppend(next);
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
