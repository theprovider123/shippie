/**
 * Edit a logged entry — move it to another meal, change the amount, or
 * remove it. Re-scales from the source food when known, otherwise scales
 * the snapshot proportionally so totals stay honest.
 */
import { useState } from 'react';
import type { Food } from '../lib/foods-data';
import type { Entry, Nutrients, Slot } from '../lib/types';
import { SLOTS, SLOT_LABEL } from '../lib/foods-data';
import { scaleNutrients } from '../lib/nutrition';
import { fmt } from '../lib/format';

interface Props {
  entry: Entry;
  food: Food | null;
  onSave: (updated: Entry) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function EntrySheet({ entry, food, onSave, onRemove, onClose }: Props) {
  const [slot, setSlot] = useState<Slot>(entry.slot);
  const [grams, setGrams] = useState(entry.grams || 0);

  function nutrientsFor(g: number): Nutrients {
    if (food) return scaleNutrients(food.per100, g);
    if (entry.grams > 0) return scaleNutrients(scaleNutrients(entry.nutrients, 100 / entry.grams), g);
    return entry.nutrients;
  }

  function save() {
    const g = Math.max(0, Math.round(grams));
    const servingGrams = food?.serving.grams ?? 0;
    const updated: Entry = {
      ...entry,
      slot,
      grams: g,
      qty: servingGrams > 0 ? Math.round((g / servingGrams) * 100) / 100 : entry.qty,
      nutrients: nutrientsFor(g),
    };
    onSave(updated);
  }

  const preview = nutrientsFor(Math.max(0, grams));

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2>{entry.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label>Amount (g)</label>
          <input
            className="num"
            inputMode="numeric"
            value={grams}
            onChange={(e) => setGrams(parseFloat(e.target.value) || 0)}
          />
          <span className="hint num">{fmt(preview.kcal)} kcal · {fmt(preview.protein_g)} g protein</span>
        </div>

        <div className="field">
          <label>Meal</label>
          <div className="qa-slot">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                className={`slot-chip ${slot === s ? 'slot-chip-on' : ''}`}
                onClick={() => setSlot(s)}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="row-between">
          <button type="button" className="btn btn-ghost" onClick={() => onRemove(entry.id)}>Remove</button>
          <button type="button" className="btn btn-accent" onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}
