// palate. — The Scale (full-screen ew-resize drag to scale formula)

import { useRef, useState } from 'react';
import { scaleFormula } from '../lib/engine.ts';
import type { Formula, FormulaIngredient } from '../lib/types.ts';
import { newId } from '../lib/store.ts';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

interface Props {
  formulas: Formula[];
  activeFormulaId: string;
  totalDoughG: number;
  shippie: ShippieIframeSdk;
  onTotalChange: (g: number) => void;
  onFormulaChange: (id: string) => void;
  onSaveFormula: (f: Formula) => void;
}

export function Scale({ formulas, activeFormulaId, totalDoughG, shippie, onTotalChange, onFormulaChange, onSaveFormula }: Props) {
  const formula = formulas.find((f) => f.id === activeFormulaId) ?? formulas[0];
  const dragRef = useRef<{ x: number; startG: number } | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [editFormula, setEditFormula] = useState<Formula | null>(null);
  const [pantryHints, setPantryHints] = useState<string[]>([]);

  const scaled = formula ? scaleFormula(formula, totalDoughG) : null;

  // Full-screen ew-resize drag
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, startG: totalDoughG };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const raw = dragRef.current.startG + dx * 3;
    const clamped = Math.max(600, Math.min(3200, Math.round(raw / 10) * 10));
    onTotalChange(clamped);
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function sendToShoppingList() {
    if (!scaled || !formula) return;
    const items = scaled.rows.map((r) => ({
      item: r.name,
      quantity: parseFloat(r.grams.toFixed(1)),
      unit: 'g',
      source: 'palate',
    }));
    try {
      void shippie.intent.broadcast('shopping-list', [{ items, formula: formula.name }]);
    } catch {
      // ignore
    }
  }

  const pieces = 2; // default — could be user-editable
  const perPiece = totalDoughG / pieces;

  if (!formula || !scaled) return null;

  return (
    <div
      className="scale-screen"
      style={{ cursor: 'ew-resize', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="scale-header">
        <span className="wordmark">palate.</span>
        <span className="scale-formula-name">formula · {formula.name.toLowerCase()}</span>
      </div>

      <div className="scale-total-block">
        <div className="scale-tag">total dough</div>
        <div className="scale-total">{totalDoughG.toLocaleString('en-US')} g</div>
        <div className="scale-hint">{Math.round(perPiece).toLocaleString('en-US')} g per loaf ×{pieces} · drag anywhere ← → to scale</div>
      </div>

      {pantryHints.length > 0 && (
        <div className="pantry-hints">
          {pantryHints.map((h) => <span key={h} className="pantry-hint">{h}</span>)}
        </div>
      )}

      <div className="scale-rows">
        {scaled.rows.map((row) => (
          <div key={row.id} className="scale-row">
            <div className="scale-row-left">
              <span className="scale-row-name">{row.name}</span>
              <span className="scale-row-pct">{row.bakers_pct % 1 === 0 ? row.bakers_pct : row.bakers_pct.toFixed(1)}%</span>
            </div>
            <span className="scale-row-grams">
              {row.bakers_pct === 2.1 || row.name === 'Salt'
                ? row.grams.toFixed(1)
                : Math.round(row.grams).toLocaleString('en-US')} g
            </span>
          </div>
        ))}

        <div className="scale-stats-row">
          <span className="scale-stat">hydration {scaled.trueHydration.toFixed(1)}%</span>
          <span className="scale-stat">· prefermented {scaled.prefermentedPct.toFixed(1)}%</span>
          <span className={`salt-badge${scaled.saltInRange ? ' salt-ok' : ' salt-warn'}`}>
            {scaled.saltInRange ? 'salt in range' : `salt high (${scaled.saltPct.toFixed(1)}%)`}
          </span>
        </div>
      </div>


      {showEditor && editFormula && (
        <FormulaEditor
          formula={editFormula}
          onSave={(f) => { onSaveFormula(f); setShowEditor(false); }}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}

// ─── Formula Editor Sheet ─────────────────────────────────────

interface EditorProps {
  formula: Formula;
  onSave: (f: Formula) => void;
  onClose: () => void;
}

function FormulaEditor({ formula: initial, onSave, onClose }: EditorProps) {
  const [f, setF] = useState<Formula>({ ...initial, ingredients: initial.ingredients.map((i) => ({ ...i })) });

  function updateIng(id: string, patch: Partial<FormulaIngredient>) {
    setF((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((i) => i.id === id ? { ...i, ...patch } : i),
    }));
  }

  function addIngredient() {
    const newIng: FormulaIngredient = {
      id: newId(),
      name: 'New ingredient',
      bakers_pct: 0,
      sort_order: f.ingredients.length,
    };
    setF((prev) => ({ ...prev, ingredients: [...prev.ingredients, newIng] }));
  }

  function removeIngredient(id: string) {
    setF((prev) => ({ ...prev, ingredients: prev.ingredients.filter((i) => i.id !== id) }));
  }

  return (
    <div className="editor-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="editor-header">
        <span className="editor-title">edit formula</span>
        <button className="editor-close" onClick={onClose}>×</button>
      </div>

      <input
        className="editor-input"
        value={f.name}
        onChange={(e) => setF((prev) => ({ ...prev, name: e.target.value }))}
        placeholder="Formula name"
      />

      <div className="editor-rows">
        {f.ingredients.map((ing) => (
          <div key={ing.id} className="editor-ing-row">
            <input
              className="editor-input editor-input-sm"
              value={ing.name}
              onChange={(e) => updateIng(ing.id, { name: e.target.value })}
            />
            <input
              className="editor-input editor-input-xs"
              type="number"
              step="0.1"
              value={ing.bakers_pct}
              onChange={(e) => updateIng(ing.id, { bakers_pct: parseFloat(e.target.value) || 0 })}
            />
            <span className="editor-pct-sym">%</span>
            <label className="editor-check">
              <input
                type="checkbox"
                checked={ing.is_prefermented ?? false}
                onChange={(e) => updateIng(ing.id, { is_prefermented: e.target.checked })}
              />
              <span>pre</span>
            </label>
            {ing.is_prefermented && (
              <input
                className="editor-input editor-input-xs"
                type="number"
                step="5"
                value={ing.hydration_pct ?? 100}
                onChange={(e) => updateIng(ing.id, { hydration_pct: parseFloat(e.target.value) || 100 })}
                placeholder="hyd%"
              />
            )}
            <button className="editor-remove" onClick={() => removeIngredient(ing.id)}>−</button>
          </div>
        ))}
      </div>

      <button className="editor-add-row" onClick={addIngredient}>+ ingredient</button>

      <div className="editor-footer">
        <button className="ticket-btn ticket-btn-extend" onClick={onClose}>cancel</button>
        <button className="ticket-btn ticket-btn-done" onClick={() => onSave({ ...f, updated_at: Date.now() })}>save</button>
      </div>
    </div>
  );
}

import React from 'react';
