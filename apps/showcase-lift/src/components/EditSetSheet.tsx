/**
 * Edit-set bottom sheet. Tap a logged set within 24h → adjust weight or
 * reps, change set-type, or delete.
 *
 * On save/delete, parent recomputes PRs for the affected variant +
 * lineage so PR history stays honest.
 */
import { useEffect, useState } from 'react';
import type { SetRow, SetType } from '../db/schema.ts';
import { EDIT_WINDOW_MS } from '../lib/constants.ts';

interface EditSetSheetProps {
  set: SetRow | null;
  exerciseName: string;
  onSave: (patch: {
    weight: number;
    reps: number;
    setType: SetType;
    note: string | null;
    durationSeconds: number | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function EditSetSheet({ set, exerciseName, onSave, onDelete, onClose }: EditSetSheetProps) {
  const [weight, setWeight] = useState(set?.weight ?? 0);
  const [reps, setReps] = useState(set?.reps ?? 0);
  const [type, setType] = useState<SetType>(set?.set_type ?? 'working');
  const [note, setNote] = useState(set?.note ?? '');
  const [duration, setDuration] = useState(set?.duration_seconds ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (set) {
      setWeight(set.weight);
      setReps(set.reps);
      setType(set.set_type);
      setNote(set.note ?? '');
      setDuration(set.duration_seconds ?? 0);
    }
  }, [set?.id]);

  if (!set) return null;

  const editable = isWithin24h(set.completed_at);

  return (
    <div
      className="lift-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit set"
      onClick={onClose}
    >
      <div className="lift-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="lift-sheet__head">
          <p className="lift-sheet__title">Edit set</p>
          <p className="lift-sheet__sub">{exerciseName}</p>
          {!editable ? (
            <p className="lift-sheet__warn">
              This set is older than 24h. Edits and deletes are disabled to keep the log honest.
            </p>
          ) : null}
        </header>

        <div className="lift-sheet__row">
          <label>
            <span className="lift-sheet__label">Weight ({set.unit})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              disabled={!editable}
              className="lift-sheet__input"
            />
          </label>
          <label>
            <span className="lift-sheet__label">Reps</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              disabled={!editable}
              className="lift-sheet__input"
            />
          </label>
        </div>

        <label className="lift-sheet__note-label">
          <span className="lift-sheet__label">Time under tension (s) — for planks / carries</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={!editable}
            placeholder="0 = rep-based"
            className="lift-sheet__input lift-sheet__note-input"
          />
        </label>

        <label className="lift-sheet__note-label">
          <span className="lift-sheet__label">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!editable}
            placeholder="e.g. paused, left elbow tweaky"
            className="lift-sheet__input lift-sheet__note-input"
          />
        </label>

        <div className="lift-sheet__type-row">
          {(['warmup', 'working', 'failure', 'drop', 'backoff'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`lift-chip ${type === t ? 'lift-chip--active' : ''}`}
              onClick={() => editable && setType(t)}
              disabled={!editable}
              aria-pressed={type === t}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="lift-sheet__actions">
          <button
            type="button"
            className="lift-secondary-btn lift-sheet__delete"
            disabled={!editable || busy}
            onClick={async () => {
              if (!editable) return;
              setBusy(true);
              try {
                await onDelete();
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="lift-secondary-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="lift-primary-btn"
            disabled={!editable || busy}
            onClick={async () => {
              if (!editable) return;
              setBusy(true);
              try {
                await onSave({
                  weight,
                  reps,
                  setType: type,
                  note: note.trim() || null,
                  durationSeconds: duration > 0 ? duration : null,
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function isWithin24h(iso: string): boolean {
  return Date.now() - Date.parse(iso) < EDIT_WINDOW_MS;
}
