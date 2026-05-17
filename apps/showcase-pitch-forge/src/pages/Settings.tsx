import { useState } from 'react';
import { pitchesToCsv } from '../lib/csv.ts';
import type { Identity, Pitch } from '../lib/store.ts';

export interface SettingsPageProps {
  identity: Identity;
  pitches: Pitch[];
  onSaveIdentity: (identity: Identity) => void;
  onClearAll: () => void;
}

export function SettingsPage({ identity, pitches, onSaveIdentity, onClearAll }: SettingsPageProps) {
  const [draft, setDraft] = useState<Identity>(identity);
  const [confirming, setConfirming] = useState(false);

  function exportCsv() {
    const csv = pitchesToCsv(pitches);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pitches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Settings</h2>
      </header>

      <div className="privacy-banner">
        <h3>Pitches stay on this phone.</h3>
        <p>
          The AI runs in your browser. Your text never leaves the device. There&apos;s no admin to
          subpoena.
        </p>
      </div>

      <section className="settings-block">
        <h3>Default identity</h3>
        <p className="muted small">Used on the print cover page when you export a PDF.</p>
        <div className="field">
          <span>Name</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <span>Role</span>
            <input
              type="text"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="Founder, Director, …"
            />
          </div>
          <div className="field">
            <span>Org</span>
            <input
              type="text"
              value={draft.org}
              onChange={(e) => setDraft({ ...draft, org: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <span>Email</span>
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </div>
        <div className="settings-actions">
          <button type="button" className="primary" onClick={() => onSaveIdentity(draft)}>
            Save identity
          </button>
        </div>
      </section>

      <section className="settings-block">
        <h3>Export pitch list</h3>
        <p className="muted small">
          CSV of pitch metadata only — type, target, deadline, status. Pitch bodies stay private.
        </p>
        <button type="button" className="ghost" onClick={exportCsv} disabled={pitches.length === 0}>
          Download CSV ({pitches.length})
        </button>
      </section>

      <section className="settings-block danger-zone">
        <h3>Clear everything</h3>
        <p className="muted small">Deletes every pitch, brief, and version on this device.</p>
        {confirming ? (
          <div className="settings-actions">
            <button
              type="button"
              className="ghost danger"
              onClick={() => {
                onClearAll();
                setConfirming(false);
              }}
            >
              Yes — delete it all
            </button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="ghost danger" onClick={() => setConfirming(true)}>
            Clear all data
          </button>
        )}
      </section>
    </section>
  );
}
