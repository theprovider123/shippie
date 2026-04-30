import { useState } from 'react';
import { clearImportFragment, type ShareBlob } from '@shippie/share';
import {
  importJournalEntry,
  type JournalImportCheck,
  type JournalSharePayload,
} from './journal-share.ts';

interface ImportCardProps {
  check: Extract<JournalImportCheck, { ok: true }>;
  onImported: (id: string) => void;
  onDiscard: () => void;
}

export function ImportCard({ check, onImported, onDiscard }: ImportCardProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blob: ShareBlob<JournalSharePayload> = check.blob;
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
      const id = await importJournalEntry(blob);
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

  const previewTitle = check.payload.title || 'untitled entry';
  const bodyPreview = check.payload.body.length > 240
    ? check.payload.body.slice(0, 240) + '…'
    : check.payload.body;

  return (
    <div className="import-card-overlay">
      <div className="import-card" role="dialog" aria-label="Imported journal entry">
        <header className="import-card-header">
          <p className="muted small">a journal entry was shared with you</p>
          <h2>{previewTitle}</h2>
          <p className={`import-badge import-badge-${badge.kind}`}>{badge.label}</p>
        </header>

        <p className="muted small">
          from <strong>{author}</strong>{' '}
          <span className="import-fingerprint">{fingerprint}</span>
        </p>

        <div className="import-card-section">
          {check.payload.sentiment_label ? (
            <p className="muted small">
              mood: {check.payload.sentiment_label}
              {check.payload.topic ? ` · topic: ${check.payload.topic}` : ''}
            </p>
          ) : null}
          <p className="import-notes">{bodyPreview}</p>
        </div>

        {err ? <p className="error import-error">{err}</p> : null}

        <div className="import-card-actions">
          <button type="button" onClick={handleDiscard} disabled={busy}>
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
