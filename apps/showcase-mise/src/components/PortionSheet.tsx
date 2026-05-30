/**
 * Portion + slot picker. Used by search, free-text, and quick-add when a
 * tap needs refining. For a known food it shows live nutrients as you
 * adjust servings or grams; for an unmatched free-text item it offers
 * optional manual nutrients so logging-by-name is never a dead end.
 */
import { useMemo, useState } from 'react';
import type { Food } from '../lib/foods-data';
import type { Nutrients, Slot } from '../lib/types';
import { SLOTS, SLOT_LABEL } from '../lib/foods-data';
import { EMPTY_NUTRIENTS, scaleNutrients } from '../lib/nutrition';
import { fmt } from '../lib/format';

export interface PortionResult {
  grams: number;
  qty: number;
  slot: Slot;
  manual?: Partial<Nutrients>;
}

interface Props {
  title?: string;
  food: Food | null;
  name: string;
  initialQty?: number;
  initialGrams?: number;
  initialSlot: Slot;
  confirmLabel?: string;
  onConfirm: (r: PortionResult) => void;
  onClose: () => void;
}

const MANUAL_FIELDS: Array<{ key: keyof Nutrients; label: string }> = [
  { key: 'kcal', label: 'kcal' },
  { key: 'protein_g', label: 'protein g' },
  { key: 'carb_g', label: 'carb g' },
  { key: 'fat_g', label: 'fat g' },
  { key: 'fiber_g', label: 'fiber g' },
];

export function PortionSheet({
  title,
  food,
  name,
  initialQty,
  initialGrams,
  initialSlot,
  confirmLabel = 'Log it',
  onConfirm,
  onClose,
}: Props) {
  const servingGrams = food?.serving.grams ?? 0;
  const [qty, setQty] = useState(initialQty ?? 1);
  const [grams, setGrams] = useState(
    initialGrams ?? (servingGrams > 0 ? servingGrams * (initialQty ?? 1) : 100),
  );
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [manual, setManual] = useState<Record<string, string>>({});

  const live: Nutrients = useMemo(
    () => (food ? scaleNutrients(food.per100, grams) : EMPTY_NUTRIENTS),
    [food, grams],
  );

  function setServings(next: number) {
    const q = Math.max(0.25, Math.round(next * 4) / 4);
    setQty(q);
    if (servingGrams > 0) setGrams(Math.round(servingGrams * q));
  }

  function setGramsDirect(g: number) {
    const v = Math.max(0, Math.round(g));
    setGrams(v);
    if (servingGrams > 0) setQty(Math.round((v / servingGrams) * 100) / 100);
  }

  function confirm() {
    const result: PortionResult = { grams, qty, slot };
    if (!food) {
      const m: Partial<Nutrients> = {};
      for (const f of MANUAL_FIELDS) {
        const raw = manual[f.key];
        const v = raw != null && raw !== '' ? parseFloat(raw) : NaN;
        if (Number.isFinite(v)) m[f.key] = v;
      }
      if (Object.keys(m).length > 0) result.manual = m;
    }
    onConfirm(result);
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2>{title ?? name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {food ? (
          <>
            <div className="field">
              <label>Servings · {food.serving.label}</label>
              <div className="qty-row">
                <div className="stepper">
                  <button type="button" onClick={() => setServings(qty - 0.5)} aria-label="Fewer">−</button>
                  <input
                    className="q num"
                    inputMode="decimal"
                    value={qty}
                    onChange={(e) => setServings(parseFloat(e.target.value) || 0)}
                  />
                  <button type="button" onClick={() => setServings(qty + 0.5)} aria-label="More">+</button>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <input
                    className="num"
                    inputMode="numeric"
                    value={grams}
                    onChange={(e) => setGramsDirect(parseFloat(e.target.value) || 0)}
                    aria-label="Grams"
                  />
                </div>
                <span className="muted num">g</span>
              </div>
            </div>

            {food.altServings && food.altServings.length > 0 ? (
              <div className="chips">
                {food.altServings.map((s) => (
                  <button key={s.label} type="button" className="slot-chip" onClick={() => setGramsDirect(s.grams)}>
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="band" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div className="stat"><div className="label">kcal</div><div className="value num">{fmt(live.kcal)}</div></div>
              <div className="stat"><div className="label">P</div><div className="value num">{fmt(live.protein_g)}</div></div>
              <div className="stat"><div className="label">C</div><div className="value num">{fmt(live.carb_g)}</div></div>
              <div className="stat"><div className="label">F</div><div className="value num">{fmt(live.fat_g)}</div></div>
            </div>
          </>
        ) : (
          <>
            <p className="hint">No match in your food list — log it by name. Add nutrients if you know them, or leave blank and edit later.</p>
            <div className="field">
              <label>Amount (g, optional)</label>
              <input className="num" inputMode="numeric" value={grams} onChange={(e) => setGramsDirect(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="grid3">
              {MANUAL_FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <input
                    className="num"
                    inputMode="decimal"
                    value={manual[f.key] ?? ''}
                    onChange={(e) => setManual((m) => ({ ...m, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </>
        )}

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

        <button type="button" className="btn btn-accent btn-block" onClick={confirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
