/**
 * The hero card. Weight × reps in 64-96px fixed-width mono numerals.
 * Adjust controls (-5 / -1 / +1 / +5) are large thumb targets.
 *
 * One save action; haptic confirm on save (where supported).
 */
import { useEffect, useState } from 'react';
import type { SetRow, SetType, Unit } from '../db/schema.ts';
import { PlateBreakdown } from './PlateBreakdown.tsx';

interface SetCardProps {
  exerciseName: string;
  setIndex: number;
  totalSets: number;
  unit: Unit;
  initialWeight: number;
  initialReps: number;
  setType: SetType;
  onSave: (entry: { weight: number; reps: number; setType: SetType }) => Promise<void>;
  /** A previous reference set ("last session: 80kg × 5") to show below. */
  reference?: { weight: number; reps: number; daysAgo: number } | null;
  /** Plate inventory + bar for the breakdown chip; null hides it. */
  plateContext?: { plates: readonly number[]; bar: number } | null;
}

const WEIGHT_STEP_SMALL = 1;
const WEIGHT_STEP_LARGE = 5;
const MIN_WEIGHT = 0;

export function SetCard({
  exerciseName,
  setIndex,
  totalSets,
  unit,
  initialWeight,
  initialReps,
  setType,
  onSave,
  reference,
  plateContext,
}: SetCardProps) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [type, setTypeState] = useState<SetType>(setType);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWeight(initialWeight);
    setReps(initialReps);
    setTypeState(setType);
  }, [initialWeight, initialReps, setType]);

  function bump(value: number, delta: number, min = 0): number {
    const next = +(value + delta).toFixed(2);
    return next < min ? min : next;
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      try {
        navigator.vibrate?.(30);
      } catch {
        // ignore
      }
      await onSave({ weight, reps, setType: type });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="lift-set-card" aria-label={`${exerciseName} set ${setIndex + 1}`}>
      <header className="lift-set-card__head">
        <p className="lift-set-card__exercise">{exerciseName}</p>
        <p className="lift-set-card__progress">
          Set {setIndex + 1}
          {totalSets > 0 ? ` of ${totalSets}` : ''}
        </p>
      </header>

      <div className="lift-set-card__hero">
        <div className="lift-set-card__metric">
          <span className="lift-set-card__numeral">{formatWeight(weight)}</span>
          <span className="lift-set-card__unit">{unit}</span>
        </div>
        <div className="lift-set-card__times">×</div>
        <div className="lift-set-card__metric">
          <span className="lift-set-card__numeral">{reps}</span>
          <span className="lift-set-card__unit">reps</span>
        </div>
      </div>

      {plateContext && type !== 'warmup' ? (
        <PlateBreakdown
          targetLoad={weight}
          barWeight={plateContext.bar}
          plates={plateContext.plates}
        />
      ) : null}

      {reference ? (
        <p className="lift-set-card__reference">
          Last time: {formatWeight(reference.weight)}
          {unit} × {reference.reps}
          <span className="lift-set-card__reference-when">
            {' '}
            · {reference.daysAgo === 0 ? 'today' : `${reference.daysAgo}d ago`}
          </span>
        </p>
      ) : null}

      <div className="lift-set-card__controls">
        <div className="lift-set-card__controls-row" aria-label="Adjust weight">
          <button
            type="button"
            className="lift-pill lift-pill--neg"
            onClick={() => setWeight((w) => bump(w, -WEIGHT_STEP_LARGE, MIN_WEIGHT))}
          >
            −5
          </button>
          <button
            type="button"
            className="lift-pill"
            onClick={() => setWeight((w) => bump(w, -WEIGHT_STEP_SMALL, MIN_WEIGHT))}
          >
            −1
          </button>
          <span className="lift-pill__label">weight</span>
          <button
            type="button"
            className="lift-pill"
            onClick={() => setWeight((w) => bump(w, WEIGHT_STEP_SMALL))}
          >
            +1
          </button>
          <button
            type="button"
            className="lift-pill lift-pill--pos"
            onClick={() => setWeight((w) => bump(w, WEIGHT_STEP_LARGE))}
          >
            +5
          </button>
        </div>

        <div className="lift-set-card__controls-row" aria-label="Adjust reps">
          <button
            type="button"
            className="lift-pill lift-pill--neg"
            onClick={() => setReps((r) => Math.max(0, r - 1))}
          >
            −1
          </button>
          <span className="lift-pill__label">reps</span>
          <button
            type="button"
            className="lift-pill lift-pill--pos"
            onClick={() => setReps((r) => r + 1)}
          >
            +1
          </button>
        </div>
      </div>

      <div className="lift-set-card__type-row">
        {(['warmup', 'working', 'failure'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`lift-chip ${type === t ? 'lift-chip--active' : ''}`}
            onClick={() => setTypeState(t)}
            aria-pressed={type === t}
          >
            {t === 'warmup' ? 'Warm-up' : t === 'working' ? 'Working' : 'Failure'}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="lift-save-btn"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save set'}
      </button>
    </section>
  );
}

function formatWeight(w: number): string {
  if (Number.isInteger(w)) return String(w);
  return w.toFixed(w % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '');
}
