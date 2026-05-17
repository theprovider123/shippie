/**
 * SymptomLogRow — one row per tracked symptom on the Today screen.
 *
 * Layout: name · scale · "Add note" expand. Scale tap = log immediately
 * (no modal). Note + trigger collapse out of the way for the typical
 * fast-log case; the doctor can still see them in History/Print.
 */
import { useState } from 'react';
import type { Symptom } from '../db/schema.ts';
import { IntensityScale } from './IntensityScale.tsx';

interface Props {
  symptom: Symptom;
  /**
   * Called when the user taps a scale value. Writes a row immediately;
   * the parent emits `symptom-logged`.
   */
  onLog: (input: { intensity: number; note?: string; trigger_text?: string }) => Promise<void>;
}

export function SymptomLogRow({ symptom, onLog }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [trigger, setTrigger] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const flash = (text: string) => {
    setConfirmation(text);
    window.setTimeout(() => setConfirmation(null), 1500);
  };

  const log = async (intensity: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await onLog({
        intensity,
        note: note.trim() || undefined,
        trigger_text: trigger.trim() || undefined,
      });
      setNote('');
      setTrigger('');
      setExpanded(false);
      flash('Logged.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="symptom-row">
      <div className="symptom-row-head">
        <div className="symptom-row-name">{symptom.name}</div>
        <button
          type="button"
          className="ghost small"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`symptom-${symptom.id}-detail`}
        >
          {expanded ? 'Hide note' : 'Add note'}
        </button>
      </div>

      <IntensityScale
        scale={symptom.default_scale}
        value={0}
        onChange={(n) => void log(n)}
        ariaLabel={`Log ${symptom.name}`}
      />

      {expanded ? (
        <div id={`symptom-${symptom.id}-detail`} className="symptom-row-detail">
          <label className="field">
            <span>Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What does it feel like?"
              maxLength={400}
            />
          </label>
          <label className="field">
            <span>What might have triggered this?</span>
            <input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="Sleep, food, stress, weather…"
              maxLength={200}
            />
          </label>
        </div>
      ) : null}

      {confirmation ? (
        <div className="symptom-row-flash" role="status">
          {confirmation}
        </div>
      ) : null}
    </div>
  );
}
