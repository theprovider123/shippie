/**
 * Custom-template editor. Fork an existing template (builtin → custom)
 * or create from scratch. Steps reorderable, sets/reps per step.
 */
import { useEffect, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  getTemplateSteps,
  insertTemplate,
} from '../db/queries.ts';
import { newId } from '../utils/ids.ts';
import type { Template, TemplateStep } from '../db/schema.ts';

interface TemplateEditorProps {
  /** When set, fork this template's steps as the starting point. */
  forkOf: string | null;
  onClose: () => void;
}

export function TemplateEditor({ forkOf, onClose }: TemplateEditorProps) {
  const lift = useLift();
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (forkOf) {
        const tpl = lift.templates.find((t) => t.id === forkOf);
        const tplSteps = await getTemplateSteps(lift.db, forkOf);
        if (cancelled) return;
        setName(tpl ? `${tpl.name} (custom)` : 'New template');
        setSteps(
          tplSteps.map((s) => ({
            ...s,
            id: newId('ts'),
            template_id: 'pending', // patched at save
          })),
        );
      } else {
        setName('New template');
        setSteps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forkOf, lift.db, lift.templates]);

  function addStep(exerciseId: string) {
    const ex = lift.exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    setSteps((prev) => [
      ...prev,
      {
        id: newId('ts'),
        template_id: 'pending',
        exercise_id: ex.id,
        variant_id: ex.variant_id ?? null,
        order_index: prev.length,
        target_sets: 3,
        target_reps: 8,
        target_load_pct: null,
      },
    ]);
  }

  function updateStep(stepId: string, patch: Partial<TemplateStep>) {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  }

  function removeStep(stepId: string) {
    setSteps((prev) => prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order_index: i })));
  }

  async function handleSave() {
    if (busy) return;
    if (steps.length === 0 || !name.trim()) return;
    setBusy(true);
    try {
      const tplId = newId('tpl');
      const tpl: Template = {
        id: tplId,
        name: name.trim(),
        scheme: null,
        source: 'custom',
        created_at: new Date().toISOString(),
      };
      const finalSteps = steps.map((s) => ({ ...s, template_id: tplId }));
      await insertTemplate(lift.db, tpl, finalSteps);
      await lift.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lift-page">
      <header className="lift-template-editor__head">
        <button type="button" className="lift-progression__back" onClick={onClose}>
          ← Cancel
        </button>
        <h1 className="lift-h1">Edit template</h1>
      </header>

      <label className="lift-template-editor__name-row">
        <span className="lift-section-label">Template name</span>
        <input
          type="text"
          className="lift-search"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Template name"
        />
      </label>

      <section className="lift-template-editor__steps">
        <p className="lift-section-label">Steps</p>
        <ul className="lift-template-editor__step-list">
          {steps.map((step, i) => {
            const ex = lift.exercises.find((e) => e.id === step.exercise_id);
            return (
              <li key={step.id} className="lift-template-editor__step-row">
                <div className="lift-template-editor__step-info">
                  <p className="lift-template-editor__step-idx">{i + 1}.</p>
                  <p className="lift-template-editor__step-name">{ex?.name ?? '(missing)'}</p>
                </div>
                <div className="lift-template-editor__step-targets">
                  <label>
                    <span>Sets</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={step.target_sets}
                      onChange={(e) => updateStep(step.id, { target_sets: Number(e.target.value) })}
                      className="lift-template-editor__num"
                    />
                  </label>
                  <label>
                    <span>Reps</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={step.target_reps}
                      onChange={(e) => updateStep(step.id, { target_reps: Number(e.target.value) })}
                      className="lift-template-editor__num"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="lift-template-editor__remove"
                  onClick={() => removeStep(step.id)}
                  aria-label={`Remove ${ex?.name ?? 'step'}`}
                >
                  ×
                </button>
              </li>
            );
          })}
          {steps.length === 0 ? (
            <li className="lift-empty">No steps yet. Add an exercise below.</li>
          ) : null}
        </ul>
      </section>

      <section className="lift-template-editor__add">
        <p className="lift-section-label">Add exercise</p>
        <select
          className="lift-search"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              addStep(e.target.value);
              e.target.value = '';
            }
          }}
          aria-label="Add exercise to template"
        >
          <option value="" disabled>Pick an exercise…</option>
          {lift.exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </section>

      <div className="lift-workout-foot">
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
          onClick={handleSave}
          disabled={busy || steps.length === 0 || !name.trim()}
        >
          Save template
        </button>
      </div>
    </div>
  );
}
