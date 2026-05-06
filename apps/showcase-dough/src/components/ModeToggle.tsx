import type { Mode } from '../recipes.ts';

interface Props {
  mode: Mode;
  onChange: (next: Mode) => void;
}

/**
 * Sourdough vs commercial-yeast switch. Drives the rest of the
 * recipe form (starter feed gate, default bulk, retard).
 */
export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="Leaven mode">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'sourdough'}
        className={`mode-chip ${mode === 'sourdough' ? 'active' : ''}`}
        onClick={() => onChange('sourdough')}
      >
        <span className="mode-name">Sourdough</span>
        <span className="mode-meta">wild starter · long bulk · retard</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'yeast'}
        className={`mode-chip ${mode === 'yeast' ? 'active' : ''}`}
        onClick={() => onChange('yeast')}
      >
        <span className="mode-name">Yeast</span>
        <span className="mode-meta">commercial · short bulk · same-day</span>
      </button>
    </div>
  );
}
