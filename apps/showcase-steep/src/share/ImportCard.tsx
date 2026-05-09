/**
 * Modal shown when a #shippie-import=… fragment carries a blend. Lets
 * the user preview the incoming blend (verified or not), then import
 * or discard.
 */
import { useState } from 'react';
import type { BlendImportCheck } from './blend-import.ts';
import { importBlend } from './blend-import.ts';
import { intentLabel } from '../components/IntentChip.tsx';

interface ImportCardProps {
  check: Extract<BlendImportCheck, { ok: true }>;
  onImported: (id: string) => void;
  onDiscard: () => void;
}

export function ImportCard({ check, onImported, onDiscard }: ImportCardProps) {
  const [busy, setBusy] = useState(false);
  const blend = check.payload;

  const verifyLabel = check.verified
    ? 'Signature verified'
    : check.reason === 'tampered'
      ? 'Signature does not match — be careful'
      : check.reason === 'malformed'
        ? 'Signature could not be read'
        : 'Verifier unavailable';

  async function commit() {
    setBusy(true);
    try {
      const id = await importBlend(blend, check.blob);
      onImported(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="data-panel-backdrop" role="presentation">
      <section
        className="data-panel"
        role="dialog"
        aria-labelledby="import-card-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="data-panel-header">
          <div>
            <h2 id="import-card-title">Import blend</h2>
            <p className="muted">{verifyLabel}</p>
          </div>
          <button type="button" className="ghost" onClick={onDiscard} aria-label="Discard import">
            ×
          </button>
        </header>

        <article className="recipe-card blend-card">
          <h3>{blend.name}</h3>
          {blend.notes ? <p className="muted">{blend.notes}</p> : null}
          {blend.intent_tags.length > 0 ? (
            <p className="blend-card-tags">
              {blend.intent_tags.map((tag) => intentLabel(tag)).join(' · ')}
            </p>
          ) : null}
        </article>

        <ul className="parts-list">
          {blend.ingredients.map((ing, idx) => (
            <li key={`${ing.slug}-${idx}`} className="parts-row">
              <span className="parts-name">{ing.common_name}</span>
              <span className="parts-amount">
                {ing.parts} {ing.parts === 1 ? 'part' : 'parts'}
              </span>
            </li>
          ))}
        </ul>

        <div className="data-panel-actions">
          <button type="button" className="primary" onClick={commit} disabled={busy}>
            Import
          </button>
          <button type="button" className="ghost" onClick={onDiscard} disabled={busy}>
            Discard
          </button>
        </div>
      </section>
    </div>
  );
}
