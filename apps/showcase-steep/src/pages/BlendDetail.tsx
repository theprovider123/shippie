/**
 * Read-only blend view. Shows herbs as parts, intent tags, brew config,
 * brew history count. Buttons: Brew · Edit · Delete · Back.
 */
import { useEffect, useState } from 'react';
import type { BlendWithIngredients } from '../db/schema.ts';
import { brewCount, deleteBlend, getBlend } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { intentLabel } from '../components/IntentChip.tsx';

interface BlendDetailProps {
  blendId: string;
  refreshKey: number;
  onEdit: () => void;
  onBrew: () => void;
  onShare: (blend: BlendWithIngredients) => void;
  onClose: () => void;
  onDeleted: () => void;
}

export function BlendDetail({
  blendId,
  refreshKey,
  onEdit,
  onBrew,
  onShare,
  onClose,
  onDeleted,
}: BlendDetailProps) {
  const [blend, setBlend] = useState<BlendWithIngredients | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      const full = await getBlend(db, blendId);
      const cnt = await brewCount(db, blendId);
      if (!cancelled) {
        setBlend(full);
        setCount(cnt);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blendId, refreshKey]);

  if (!blend) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const totalParts = blend.ingredients.reduce((sum, ing) => sum + ing.parts, 0);
  const handleDelete = async () => {
    if (!window.confirm(`Delete “${blend.name}”? Brew history is preserved.`)) return;
    setBusy(true);
    try {
      await deleteBlend(resolveLocalDb(), blendId);
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{blend.name}</h1>
          {blend.notes ? <p className="muted">{blend.notes}</p> : null}
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Back
        </button>
      </header>

      {blend.intent_tags.length > 0 ? (
        <div className="intent-chip-row" aria-label="Intent tags">
          {blend.intent_tags.map((tag) => (
            <span key={tag} className="intent-chip intent-chip-sm">
              {intentLabel(tag)}
            </span>
          ))}
        </div>
      ) : null}

      <section className="blend-detail-section" aria-label="Ingredients">
        <h2>Ingredients</h2>
        {blend.ingredients.length === 0 ? (
          <p className="muted">No herbs yet — tap Edit to add some.</p>
        ) : (
          <ul className="parts-list">
            {blend.ingredients.map((ing) => (
              <li key={ing.id} className="parts-row">
                <span className="parts-name">{ing.herb?.common_name ?? 'Unknown herb'}</span>
                <span className="parts-amount">
                  {ing.parts} {ing.parts === 1 ? 'part' : 'parts'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {totalParts > 0 ? (
          <p className="muted parts-total">{totalParts} parts total</p>
        ) : null}
      </section>

      <section className="blend-detail-section" aria-label="Brew baseline">
        <h2>Brew baseline</h2>
        <dl className="data-health-grid">
          <div>
            <dt>Water</dt>
            <dd>{blend.default_temp_c ? `${blend.default_temp_c}°C` : '—'}</dd>
          </div>
          <div>
            <dt>Steep</dt>
            <dd>{blend.default_steep_minutes ? `${blend.default_steep_minutes}m` : '—'}</dd>
          </div>
          <div>
            <dt>Resteeps</dt>
            <dd>{blend.max_resteeps ?? '1'}</dd>
          </div>
          <div>
            <dt>Default batch</dt>
            <dd>{blend.default_batch ?? 'cup'}</dd>
          </div>
        </dl>
      </section>

      {count > 0 ? (
        <p className="muted">You've brewed this {count === 1 ? 'once' : `${count} times`}.</p>
      ) : null}

      <div className="data-panel-actions">
        <button
          type="button"
          className="primary"
          onClick={onBrew}
          disabled={blend.ingredients.length === 0}
        >
          Brew it
        </button>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          onClick={() => onShare(blend)}
          disabled={blend.ingredients.length === 0}
        >
          Share
        </button>
        <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}
