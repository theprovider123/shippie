/**
 * Symptoms — manage the user's tracked-symptom list.
 *
 * Add, remove, reorder. No clinical-vocabulary autocomplete; the user
 * uses whatever name fits their condition. (Voice doc: "patterns, not
 * predictions" — the app doesn't decide what counts as a symptom.)
 */
import { useState } from 'react';
import type { Symptom, SymptomScale } from '../db/schema.ts';

interface Props {
  symptoms: Symptom[];
  onCreate: (input: { name: string; default_scale: SymptomScale }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (idsInOrder: string[]) => Promise<void>;
  onClose: () => void;
}

export function Symptoms({ symptoms, onCreate, onDelete, onReorder, onClose }: Props) {
  const [name, setName] = useState('');
  const [scale, setScale] = useState<SymptomScale>('1-5');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), default_scale: scale });
      setName('');
      setScale('1-5');
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const ids = symptoms.map((s) => s.id);
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= ids.length) return;
    const swapped = [...ids];
    [swapped[idx], swapped[next]] = [swapped[next]!, swapped[idx]!];
    await onReorder(swapped);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Manage</p>
          <h1>Symptoms</h1>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Done
        </button>
      </header>

      <section className="section">
        <h2 className="section-title">Add a symptom</h2>
        <div className="form-row">
          <label className="field flex">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Joint pain, brain fog, cramps…"
              maxLength={60}
            />
          </label>
          <label className="field">
            <span>Scale</span>
            <select value={scale} onChange={(e) => setScale(e.target.value as SymptomScale)}>
              <option value="1-5">1 to 5</option>
              <option value="present-absent">Present or absent</option>
            </select>
          </label>
        </div>
        <button type="button" className="primary" disabled={!name.trim() || busy} onClick={() => void create()}>
          {busy ? 'Adding…' : 'Add symptom'}
        </button>
      </section>

      <section className="section">
        <h2 className="section-title">Tracked symptoms</h2>
        {symptoms.length === 0 ? (
          <p className="empty">No symptoms tracked yet.</p>
        ) : (
          <ul className="manage-list">
            {symptoms.map((s, i) => (
              <li key={s.id} className="manage-row">
                <div className="manage-row-text">
                  <strong>{s.name}</strong>
                  <div className="muted small">
                    {s.default_scale === '1-5' ? '1-5 scale' : 'present / absent'}
                  </div>
                </div>
                <div className="manage-row-actions">
                  <button
                    type="button"
                    className="ghost small"
                    aria-label={`Move ${s.name} up`}
                    onClick={() => void move(s.id, -1)}
                    disabled={i === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ghost small"
                    aria-label={`Move ${s.name} down`}
                    onClick={() => void move(s.id, 1)}
                    disabled={i === symptoms.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="danger small"
                    onClick={() => {
                      if (window.confirm(`Remove "${s.name}" and all its entries?`)) {
                        void onDelete(s.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
