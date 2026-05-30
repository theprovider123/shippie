/**
 * Create a user food. Values can be entered per-serving (the default,
 * which is how packaging reads) or per-100 g; we always store per-100 g.
 */
import { useState } from 'react';
import type { Food } from '../lib/foods-data';
import type { Nutrients } from '../lib/types';
import { EMPTY_NUTRIENTS } from '../lib/nutrition';
import { newId } from '../lib/store';

interface Props {
  initialName?: string;
  onSave: (food: Food) => void;
  onClose: () => void;
}

const FIELDS: Array<{ key: keyof Nutrients; label: string }> = [
  { key: 'kcal', label: 'kcal' },
  { key: 'protein_g', label: 'protein g' },
  { key: 'carb_g', label: 'carb g' },
  { key: 'fat_g', label: 'fat g' },
  { key: 'fiber_g', label: 'fiber g' },
  { key: 'sodium_mg', label: 'sodium mg' },
  { key: 'caffeine_mg', label: 'caffeine mg' },
];

export function CustomFoodSheet({ initialName, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [brand, setBrand] = useState('');
  const [servingLabel, setServingLabel] = useState('serving');
  const [servingGrams, setServingGrams] = useState('100');
  const [basis, setBasis] = useState<'serving' | '100g'>('serving');
  const [vals, setVals] = useState<Record<string, string>>({});

  const grams = Math.max(1, parseFloat(servingGrams) || 100);
  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    const per100: Nutrients = { ...EMPTY_NUTRIENTS };
    for (const f of FIELDS) {
      const v = parseFloat(vals[f.key] ?? '');
      if (!Number.isFinite(v)) continue;
      per100[f.key] = basis === '100g' ? v : (v / grams) * 100;
    }
    const food: Food = {
      id: newId('custom'),
      name: name.trim(),
      per100,
      serving: { label: servingLabel.trim() || 'serving', grams },
      category: 'prepared',
      source: 'custom',
    };
    if (brand.trim()) food.brand = brand.trim();
    onSave(food);
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2>New food</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. House granola" />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Brand (optional)</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="field">
            <label>Serving name</label>
            <input value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Serving weight (g)</label>
            <input className="num" inputMode="numeric" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} />
          </div>
          <div className="field">
            <label>Values are per</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value as 'serving' | '100g')}>
              <option value="serving">serving</option>
              <option value="100g">100 g</option>
            </select>
          </div>
        </div>

        <div className="grid3">
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                className="num"
                inputMode="decimal"
                value={vals[f.key] ?? ''}
                onChange={(e) => setVals((m) => ({ ...m, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-accent btn-block" disabled={!canSave} onClick={save}>
          Save food
        </button>
      </div>
    </div>
  );
}
