/**
 * Turn today's logged items into a reusable saved meal ("Usual breakfast").
 * Builds from food-backed entries so the meal can be re-logged exactly.
 */
import { useState } from 'react';
import type { Entry, MealItem } from '../lib/types';
import { fmt } from '../lib/format';

interface Props {
  candidates: Entry[];
  onSave: (name: string, items: MealItem[]) => void;
  onClose: () => void;
}

export function MealBuilderSheet({ candidates, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(candidates.map((e) => e.id)));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const items: MealItem[] = candidates
      .filter((e) => picked.has(e.id) && e.foodId)
      .map((e) => ({ foodId: e.foodId as string, qty: e.qty }));
    if (!name.trim() || items.length === 0) return;
    onSave(name.trim(), items);
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2>Save a meal</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {candidates.length === 0 ? (
          <p className="hint">Log a few foods today first, then come back to bundle them into a reusable meal.</p>
        ) : (
          <>
            <div className="field">
              <label>Meal name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Usual breakfast" />
            </div>
            <div className="list">
              {candidates.map((e) => (
                <label className="result" key={e.id} style={{ cursor: 'pointer' }}>
                  <span style={{ flex: 1 }}>
                    <span className="nm">{e.name}</span>
                    <span className="det">{fmt(e.grams)} g · {fmt(e.nutrients.kcal)} kcal</span>
                  </span>
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-accent btn-block" onClick={save} disabled={!name.trim() || picked.size === 0}>
              Save meal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
