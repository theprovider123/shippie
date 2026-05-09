/**
 * Full-screen Brew Mode. Pick batch, see scaled grams, run the steep
 * timer with re-steep prompts, jot a one-line note when done.
 */
import { useEffect, useMemo, useState } from 'react';
import type { BatchSize, BlendWithIngredients } from '../db/schema.ts';
import { appendBrewLog, getBlend } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { batchPreset, DEFAULT_BATCHES, formatGrams, scaleToBatch } from '../utils/scale.ts';
import { BrewTimer } from '../components/BrewTimer.tsx';

interface BrewModeProps {
  blendId: string;
  onClose: () => void;
}

type Phase = 'setup' | 'brewing' | 'note';

export function BrewMode({ blendId, onClose }: BrewModeProps) {
  const [blend, setBlend] = useState<BlendWithIngredients | null>(null);
  const [batch, setBatch] = useState<BatchSize>('cup');
  const [phase, setPhase] = useState<Phase>('setup');
  const [steepIndex, setSteepIndex] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const full = await getBlend(resolveLocalDb(), blendId);
      if (cancelled) return;
      setBlend(full);
      if (full?.default_batch) setBatch(full.default_batch);
    })();
    return () => {
      cancelled = true;
    };
  }, [blendId]);

  const preset = batchPreset(batch);
  const scaled = useMemo(() => {
    if (!blend) return [];
    return scaleToBatch(blend.ingredients, preset.totalGrams);
  }, [blend, preset.totalGrams]);

  const steepSeconds = (blend?.default_steep_minutes ?? 5) * 60;
  const maxResteeps = Math.max(0, blend?.max_resteeps ?? 1);

  const finishBrew = async () => {
    setBusy(true);
    try {
      await appendBrewLog(resolveLocalDb(), {
        blend_id: blendId,
        brewed_at: new Date().toISOString(),
        batch_label: batch,
        note: note.trim() || null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!blend) {
    return (
      <div className="page brew-mode" data-shippie-wakelock>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page brew-mode" data-shippie-wakelock>
      <header className="page-header">
        <div>
          <h1>{blend.name}</h1>
          <p className="muted">{preset.label} · {formatGrams(preset.totalGrams)} total</p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Done
        </button>
      </header>

      {phase === 'setup' ? (
        <>
          <section className="brew-batch-picker" aria-label="Batch size">
            {DEFAULT_BATCHES.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`brew-batch-option${batch === b.key ? ' active' : ''}`}
                onClick={() => setBatch(b.key)}
              >
                <span className="brew-batch-label">{b.label}</span>
                <span className="brew-batch-grams">{formatGrams(b.totalGrams)}</span>
              </button>
            ))}
          </section>

          <section className="brew-recipe" aria-label="Scaled recipe">
            <h2>Pour</h2>
            <ul className="parts-list brew-recipe-list">
              {scaled.map((row) => (
                <li key={row.ingredient.id} className="parts-row">
                  <span className="parts-name">
                    {blend.ingredients.find((i) => i.id === row.ingredient.id)?.herb?.common_name ??
                      'Unknown'}
                  </span>
                  <span className="parts-amount">{formatGrams(row.grams)}</span>
                </li>
              ))}
            </ul>
            <p className="muted">
              {blend.default_temp_c ? `${blend.default_temp_c}°C water · ` : ''}
              {blend.default_steep_minutes ? `${blend.default_steep_minutes} min steep` : 'set your own time'}
            </p>
          </section>

          <div className="data-panel-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setSteepIndex(0);
                setPhase('brewing');
              }}
              disabled={blend.ingredients.length === 0}
            >
              Start steeping
            </button>
          </div>
        </>
      ) : null}

      {phase === 'brewing' ? (
        <>
          <p className="muted">
            Steep {steepIndex + 1} of {1 + maxResteeps}
          </p>
          <BrewTimer
            seconds={steepSeconds}
            label={steepIndex === 0 ? 'First infusion' : `Infusion ${steepIndex + 1}`}
          />
          <div className="data-panel-actions">
            {steepIndex < maxResteeps ? (
              <button
                type="button"
                onClick={() => setSteepIndex((i) => i + 1)}
              >
                Re-steep
              </button>
            ) : null}
            <button type="button" className="primary" onClick={() => setPhase('note')}>
              Done
            </button>
          </div>
        </>
      ) : null}

      {phase === 'note' ? (
        <>
          <label className="field">
            <span>Brew note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="How did it feel? Drinks well? Try a tweak next time?"
              autoFocus
            />
          </label>
          <div className="data-panel-actions">
            <button type="button" className="primary" onClick={finishBrew} disabled={busy}>
              Save brew
            </button>
            <button type="button" className="ghost" onClick={finishBrew} disabled={busy}>
              Skip note
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
