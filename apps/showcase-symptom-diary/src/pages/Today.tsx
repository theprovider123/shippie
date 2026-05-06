/**
 * Today — the quick-log page.
 *
 * One row per tracked symptom. One-tap intensity = a saved entry.
 * Below that: medication tiles ("Log dose taken") and a soft prompt
 * triggered by an inbound mood-logged / sleep-logged intent.
 */
import { useEffect, useState } from 'react';
import type { Medication, Symptom } from '../db/schema.ts';
import { SymptomLogRow } from '../components/SymptomLogRow.tsx';

interface Props {
  symptoms: Symptom[];
  medications: Medication[];
  onLogSymptom: (input: {
    symptom_id: string;
    intensity: number;
    note?: string;
    trigger_text?: string;
  }) => Promise<void>;
  onLogMedDose: (medicationId: string) => Promise<void>;
  /** Soft-prompt copy ("Mood was low — log a symptom?"). Null = no prompt. */
  softPrompt: string | null;
  onDismissPrompt: () => void;
  onManageSymptoms: () => void;
  onManageMedications: () => void;
}

export function Today({
  symptoms,
  medications,
  onLogSymptom,
  onLogMedDose,
  softPrompt,
  onDismissPrompt,
  onManageSymptoms,
  onManageMedications,
}: Props) {
  const [busyMedId, setBusyMedId] = useState<string | null>(null);
  const [todayLabel, setTodayLabel] = useState('');

  useEffect(() => {
    const now = new Date();
    setTodayLabel(
      now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    );
  }, []);

  const logDose = async (medId: string) => {
    if (busyMedId) return;
    setBusyMedId(medId);
    try {
      await onLogMedDose(medId);
    } finally {
      setBusyMedId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Today</p>
          <h1>{todayLabel || 'Today'}</h1>
        </div>
      </header>

      {softPrompt ? (
        <div className="soft-prompt" role="status">
          <p>{softPrompt}</p>
          <button type="button" className="ghost small" onClick={onDismissPrompt}>
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Symptoms</h2>
          <button type="button" className="ghost small" onClick={onManageSymptoms}>
            Manage
          </button>
        </div>
        {symptoms.length === 0 ? (
          <p className="empty">No symptoms tracked yet. Add one to start logging.</p>
        ) : (
          <ul className="symptom-list">
            {symptoms.map((s) => (
              <li key={s.id}>
                <SymptomLogRow
                  symptom={s}
                  onLog={async (input) => {
                    await onLogSymptom({ symptom_id: s.id, ...input });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Medications</h2>
          <button type="button" className="ghost small" onClick={onManageMedications}>
            Manage
          </button>
        </div>
        {medications.length === 0 ? (
          <p className="empty">No medications added yet.</p>
        ) : (
          <ul className="med-list">
            {medications.map((m) => (
              <li key={m.id} className="med-tile">
                <div className="med-tile-text">
                  <strong>{m.name}</strong>
                  {m.dose ? <span className="muted small"> · {m.dose}</span> : null}
                  {m.schedule_text ? <div className="muted small">{m.schedule_text}</div> : null}
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={busyMedId === m.id}
                  onClick={() => void logDose(m.id)}
                >
                  {busyMedId === m.id ? 'Saving…' : 'Log dose'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
