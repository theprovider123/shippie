/**
 * Medications — manage active meds + dose schedules.
 *
 * Schedule is free text. We deliberately don't parse "twice daily at 8
 * and 18" because mis-parsing a real prescription would be a small
 * harm. The doctor reads the schedule line as-is on the print export.
 */
import { useState } from 'react';
import type { Medication } from '../db/schema.ts';

interface Props {
  medications: Medication[];
  onCreate: (input: { name: string; dose?: string; schedule_text?: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Omit<Medication, 'id' | 'created_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function Medications({ medications, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [schedule, setSchedule] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        dose: dose.trim() || undefined,
        schedule_text: schedule.trim() || undefined,
      });
      setName('');
      setDose('');
      setSchedule('');
    } finally {
      setBusy(false);
    }
  };

  const active = medications.filter((m) => m.active === 1);
  const archived = medications.filter((m) => m.active !== 1);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Manage</p>
          <h1>Medications</h1>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Done
        </button>
      </header>

      <section className="section">
        <h2 className="section-title">Add a medication</h2>
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naproxen, hydroxychloroquine…"
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>Dose (optional)</span>
          <input
            type="text"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="500mg"
            maxLength={40}
          />
        </label>
        <label className="field">
          <span>Schedule (free text)</span>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="Twice daily with food"
            maxLength={120}
          />
        </label>
        <button type="button" className="primary" disabled={!name.trim() || busy} onClick={() => void create()}>
          {busy ? 'Adding…' : 'Add medication'}
        </button>
      </section>

      <section className="section">
        <h2 className="section-title">Active</h2>
        {active.length === 0 ? (
          <p className="empty">No active medications.</p>
        ) : (
          <ul className="manage-list">
            {active.map((m) => (
              <li key={m.id} className="manage-row">
                <div className="manage-row-text">
                  <strong>{m.name}</strong>
                  {m.dose ? <span className="muted small"> · {m.dose}</span> : null}
                  {m.schedule_text ? <div className="muted small">{m.schedule_text}</div> : null}
                </div>
                <div className="manage-row-actions">
                  <button type="button" className="ghost small" onClick={() => void onUpdate(m.id, { active: 0 })}>
                    Archive
                  </button>
                  <button
                    type="button"
                    className="danger small"
                    onClick={() => {
                      if (window.confirm(`Delete "${m.name}" and all its dose history?`)) {
                        void onDelete(m.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section className="section">
          <h2 className="section-title">Archived</h2>
          <ul className="manage-list">
            {archived.map((m) => (
              <li key={m.id} className="manage-row">
                <div className="manage-row-text">
                  <strong>{m.name}</strong>
                  {m.dose ? <span className="muted small"> · {m.dose}</span> : null}
                </div>
                <div className="manage-row-actions">
                  <button type="button" className="ghost small" onClick={() => void onUpdate(m.id, { active: 1 })}>
                    Reactivate
                  </button>
                  <button
                    type="button"
                    className="danger small"
                    onClick={() => {
                      if (window.confirm(`Delete "${m.name}" and all its dose history?`)) {
                        void onDelete(m.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
