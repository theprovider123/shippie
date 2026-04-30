import { useState } from 'react';
import { clearImportFragment, type ShareBlob } from '@shippie/share';
import {
  importVisit,
  type VisitImportCheck,
  type VisitSharePayload,
} from './visit-share.ts';

interface ImportCardProps {
  check: Extract<VisitImportCheck, { ok: true }>;
  onImported: (
    visit: Awaited<ReturnType<typeof importVisit>>,
  ) => void;
  onDiscard: () => void;
}

export function ImportCard({ check, onImported, onDiscard }: ImportCardProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blob: ShareBlob<VisitSharePayload> = check.blob;
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
      const visit = await importVisit(blob);
      clearImportFragment();
      onImported(visit);
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
      <div className="import-card" role="dialog" aria-label="Imported restaurant memory">
        <header className="import-card-header">
          <p className="muted small">a memory was shared with you</p>
          <h2>{check.payload.name}</h2>
          <p className={`import-badge import-badge-${badge.kind}`}>{badge.label}</p>
        </header>

        <p className="muted small">
          from <strong>{author}</strong>{' '}
          <span className="import-fingerprint">{fingerprint}</span>
        </p>

        {check.payload.photoDataUrl ? (
          <img src={check.payload.photoDataUrl} alt="" className="import-photo" />
        ) : null}

        <div className="import-card-section">
          {check.payload.rating ? (
            <p className="muted small">rating: {check.payload.rating}/5</p>
          ) : null}
          <p className="muted small">visited: {new Date(check.payload.visitedAt).toLocaleDateString()}</p>
          {check.payload.notes ? <p className="import-notes">{check.payload.notes}</p> : null}
        </div>

        {err ? <p className="error import-error">{err}</p> : null}

        <div className="import-card-actions">
          <button type="button" onClick={handleDiscard} disabled={busy}>Discard</button>
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
