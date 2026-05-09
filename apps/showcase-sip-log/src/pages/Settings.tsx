/**
 * Settings — daily targets the user can tune.
 *
 * Three knobs:
 *   - Daily water goal in ml.
 *   - Caffeine cutoff hour (0–23).
 *   - Daily caffeine ceiling in mg.
 *
 * Saved on every change so there's no "save" button to forget.
 */
import { useState } from 'react';
import type { Targets } from '../db.ts';

interface SettingsProps {
  targets: Targets;
  onChange: (next: Targets) => void;
}

export function Settings({ targets, onChange }: SettingsProps) {
  const [draft, setDraft] = useState<Targets>(targets);

  function patch(part: Partial<Targets>) {
    const next = { ...draft, ...part };
    setDraft(next);
    onChange(next);
  }

  return (
    <div className="settings">
      <section className="card" aria-label="Daily targets">
        <p className="eyebrow">daily targets</p>
        <div className="settings-list">
          <label className="setting">
            <span className="setting-label">water target (ml)</span>
            <input
              type="number"
              min={500}
              max={6000}
              step={100}
              value={draft.water_ml}
              onChange={(e) => patch({ water_ml: clamp(Number(e.target.value) || 0, 500, 6000) })}
            />
          </label>
          <label className="setting">
            <span className="setting-label">caffeine cutoff hour (0–23)</span>
            <input
              type="number"
              min={0}
              max={23}
              step={1}
              value={draft.caffeine_cutoff_hour}
              onChange={(e) =>
                patch({ caffeine_cutoff_hour: clamp(Number(e.target.value) || 0, 0, 23) })
              }
            />
            <span className="setting-help">caffeine logged at or after this hour shows a sleep warning.</span>
          </label>
          <label className="setting">
            <span className="setting-label">caffeine ceiling (mg)</span>
            <input
              type="number"
              min={0}
              max={1200}
              step={50}
              value={draft.caffeine_max_mg}
              onChange={(e) =>
                patch({ caffeine_max_mg: clamp(Number(e.target.value) || 0, 0, 1200) })
              }
            />
            <span className="setting-help">400 mg is the FDA safe-for-most-adults figure.</span>
          </label>
        </div>
      </section>

    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
