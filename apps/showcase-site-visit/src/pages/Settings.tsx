/**
 * Settings — inspector identity (name + role) and exports. Identity
 * shows up on the print page above the signature; CSV export dumps
 * sites + visits + checks + incidents for record-keeping.
 */

import { useState } from 'react';

export interface InspectorIdentity {
  name: string;
  role: string;
}

export interface SettingsPageProps {
  identity: InspectorIdentity;
  onChange: (identity: InspectorIdentity) => void;
  onExportCsv: () => void;
  onResetAll: () => void;
}

export function SettingsPage({ identity, onChange, onExportCsv, onResetAll }: SettingsPageProps) {
  const [name, setName] = useState(identity.name);
  const [role, setRole] = useState(identity.role);

  function save() {
    onChange({ name: name.trim(), role: role.trim() });
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      <section className="page-section">
        <h2 className="page-section__title">inspector</h2>
        <div className="form-card">
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
          />
          <input
            className="text-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="role (eg. gas safe engineer)"
          />
          <div className="form-card__actions">
            <button type="button" className="primary" onClick={save}>
              save
            </button>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="page-section__title">data</h2>
        <p className="muted">Everything is on this phone. No account, no upload.</p>
        <div className="button-row">
          <button type="button" className="primary" onClick={onExportCsv}>
            Export CSV
          </button>
          <button
            type="button"
            className="link-button danger"
            onClick={() => {
              if (confirm('Wipe every site, visit, check, and incident on this phone?')) onResetAll();
            }}
          >
            Wipe everything
          </button>
        </div>
      </section>

      <section className="page-section">
        <h2 className="page-section__title">privacy</h2>
        <p className="muted">
          Photos and signatures are written to your phone's private app storage. They never leave
          this device unless you tap <strong>Print for record</strong> and choose to save the PDF
          somewhere.
        </p>
      </section>
    </section>
  );
}
