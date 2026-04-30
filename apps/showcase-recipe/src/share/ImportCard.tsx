/**
 * Top-of-screen import card. Surfaces when the URL hash carries a
 * #shippie-import=… fragment AND the blob is a valid recipe shape.
 * Shows the recipe preview, signature status, and Import / Discard.
 */
import { useState } from 'react';
import type { ShareBlob } from '@shippie/share';
import { clearImportFragment } from '@shippie/share';
import { importRecipe, type RecipeImportCheck } from './recipe-import.ts';
import type { RecipeSharePayload } from './recipe-share.ts';

interface ImportCardProps {
  check: Extract<RecipeImportCheck, { ok: true }>;
  onImported: (id: string) => void;
  onDiscard: () => void;
}

export function ImportCard({ check, onImported, onDiscard }: ImportCardProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blob: ShareBlob<RecipeSharePayload> = check.blob;
  const author = blob.author.name ?? 'unnamed device';
  const fingerprint = blob.author.pubkey.slice(0, 12) + '…';

  let badge: { kind: 'ok' | 'warn' | 'err'; label: string };
  if (check.verified) {
    badge = { kind: 'ok', label: '✓ signature verified' };
  } else if (check.reason === 'tampered') {
    badge = { kind: 'err', label: '✗ signature does not match — modified in transit?' };
  } else {
    badge = { kind: 'warn', label: '⚠ unverified — your browser cannot check the signature' };
  }

  async function handleImport() {
    setBusy(true);
    setErr(null);
    try {
      const id = await importRecipe(blob);
      clearImportFragment();
      onImported(id);
    } catch (e) {
      setErr((e as Error).message ?? 'Could not import.');
      setBusy(false);
    }
  }

  function handleDiscard() {
    clearImportFragment();
    onDiscard();
  }

  return (
    <div className="import-card-overlay">
      <div className="import-card" role="dialog" aria-label="Imported recipe">
        <header className="import-card-header">
          <p className="muted small">a recipe was shared with you</p>
          <h2>{check.payload.title}</h2>
          <p className={`import-badge import-badge-${badge.kind}`}>{badge.label}</p>
        </header>

        <div className="import-card-meta">
          <p className="muted small">
            from <strong>{author}</strong>{' '}
            <span className="import-fingerprint">{fingerprint}</span>
          </p>
          {check.payload.cook_minutes ? (
            <p className="muted small">
              cook time: {check.payload.cook_minutes}m{' '}
              {check.payload.servings ? `· serves ${check.payload.servings}` : ''}
            </p>
          ) : null}
        </div>

        {check.payload.ingredients.length > 0 ? (
          <div className="import-card-section">
            <p className="muted small">ingredients ({check.payload.ingredients.length})</p>
            <ul className="import-ingredients">
              {check.payload.ingredients.slice(0, 8).map((ing, i) => (
                <li key={i}>
                  {ing.amount ? <strong>{ing.amount} </strong> : null}
                  {ing.unit ? <em>{ing.unit} </em> : null}
                  {ing.name}
                </li>
              ))}
              {check.payload.ingredients.length > 8 ? (
                <li className="muted small">
                  + {check.payload.ingredients.length - 8} more…
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {check.payload.notes ? (
          <div className="import-card-section">
            <p className="muted small">notes</p>
            <p className="import-notes">{check.payload.notes}</p>
          </div>
        ) : null}

        {err ? <p className="error import-error">{err}</p> : null}

        <div className="import-card-actions">
          <button type="button" className="ghost" onClick={handleDiscard} disabled={busy}>
            Discard
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleImport}
            disabled={busy || badge.kind === 'err'}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
