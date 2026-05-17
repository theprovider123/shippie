/**
 * Bottom-sheet for logging a custom amount + optional note.
 *
 * Pre-fills with the preset for the chosen kind so the user can tweak
 * 250 → 330 ml without typing the whole thing.
 */
import { useState } from 'react';
import { PRESETS, type SipKind } from '../db.ts';

interface CustomSheetProps {
  kind: SipKind;
  onClose: () => void;
  onSubmit: (kind: SipKind, ml: number, mg: number, note: string) => void;
}

const KINDS: SipKind[] = ['water', 'coffee-espresso', 'coffee-mug', 'tea'];

export function CustomSheet({ kind, onClose, onSubmit }: CustomSheetProps) {
  const [active, setActive] = useState<SipKind>(kind);
  const preset = PRESETS[active];
  const [ml, setMl] = useState(preset.ml);
  const [mg, setMg] = useState(preset.mg);
  const [note, setNote] = useState('');

  function pick(next: SipKind) {
    setActive(next);
    const p = PRESETS[next];
    setMl(p.ml);
    setMg(p.mg);
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Custom log">
        <h2>Custom log</h2>
        <div className="sheet-kinds">
          {KINDS.map((k) => {
            const p = PRESETS[k];
            return (
              <button
                key={k}
                type="button"
                className={`sheet-kind ${active === k ? 'sheet-kind-on' : ''}`}
                onClick={() => pick(k)}
              >
                <span aria-hidden="true">{p.emoji}</span> {p.label}
              </button>
            );
          })}
        </div>
        <label className="field">
          <span>volume (ml)</span>
          <input
            type="number"
            min={0}
            max={2000}
            step={10}
            value={ml}
            onChange={(e) => setMl(Number(e.target.value) || 0)}
          />
        </label>
        {active !== 'water' ? (
          <label className="field">
            <span>caffeine (mg)</span>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={mg}
              onChange={(e) => setMg(Number(e.target.value) || 0)}
            />
          </label>
        ) : null}
        <label className="field">
          <span>note (optional)</span>
          <input
            type="text"
            placeholder="with breakfast"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onSubmit(active, ml, mg, note.trim())}>
            Log it
          </button>
        </div>
      </div>
    </div>
  );
}
