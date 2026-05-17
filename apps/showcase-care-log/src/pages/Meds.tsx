/**
 * Meds — manage active meds, log doses, see recent timeline.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { CaregiverRole } from '../sync/pairing.ts';
import {
  addMed,
  deactivateMed,
  logMedDose,
  readActiveMeds,
  readDosesForMed,
  readMedDoses,
  type MedDose,
  type MedItem,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { MedRow } from '../components/MedRow.tsx';
import { MedDoseTimeline } from '../components/MedDoseTimeline.tsx';
import { CaregiverPill } from '../components/CaregiverPill.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: CaregiverRole;
}

export function MedsPage({ doc, viewer }: Props) {
  const meds = useYjs(doc, (d): readonly MedItem[] => readActiveMeds(d));
  const allDoses = useYjs(doc, (d): readonly MedDose[] => readMedDoses(d));
  const [adding, setAdding] = useState(false);

  function lastDoseFor(medId: string) {
    return readDosesForMed(doc, medId, 1)[0];
  }

  function dosesFor(medId: string) {
    return allDoses.filter((d) => d.med_id === medId);
  }

  function logDose(medId: string, missed: boolean) {
    const dose = logMedDose(doc, medId, viewer, '', missed);
    if (!missed) {
      emitIntent('care-dose-given', {
        med_id: medId,
        given_at: dose.given_at,
        given_by: viewer,
      });
    }
  }

  const recentDoses = [...allDoses].sort((a, b) => b.given_at - a.given_at).slice(0, 10);
  const medsById = new Map(meds.map((m) => [m.id, m]));

  return (
    <section>
      <p className="cl-page-eyebrow">Meds</p>
      <h2 className="cl-page-title">Doses, both phones.</h2>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Active meds</h3>
          <button
            type="button"
            className="cl-btn"
            data-size="sm"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? 'Cancel' : 'Add med'}
          </button>
        </div>

        {adding ? <AddMedForm doc={doc} onDone={() => setAdding(false)} /> : null}

        {meds.length === 0 ? (
          <p className="cl-empty">No active meds.</p>
        ) : (
          meds.map((med) => (
            <div key={med.id} className="cl-stack">
              <MedRow
                med={med}
                lastDose={lastDoseFor(med.id)}
                viewer={viewer}
                onLog={(id) => logDose(id, false)}
                onMarkMissed={(id) => logDose(id, true)}
                onDeactivate={(id) => deactivateMed(doc, id)}
              />
              <MedDoseTimeline doses={dosesFor(med.id)} days={14} />
            </div>
          ))
        )}
      </div>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Recent doses</h3>
        </div>
        {recentDoses.length === 0 ? (
          <p className="cl-empty">No doses logged yet.</p>
        ) : (
          recentDoses.map((dose) => {
            const med = medsById.get(dose.med_id);
            const date = new Date(dose.given_at).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            return (
              <div key={dose.id} className="cl-card cl-card-tight">
                <div className="cl-row">
                  <CaregiverPill role={dose.given_by} viewer={viewer} />
                  <span className="cl-mute" style={{ fontSize: '0.875rem' }}>
                    {med ? med.name : 'unknown med'}
                    {dose.missed ? ' · missed' : ''}
                  </span>
                  <span
                    className="cl-row-end cl-mute"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}
                  >
                    {date}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function AddMedForm({ doc, onDone }: { doc: Y.Doc; onDone: () => void }) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [schedule, setSchedule] = useState('');

  function submit() {
    if (!name.trim()) return;
    addMed(doc, {
      name,
      dose,
      schedule_text: schedule,
    });
    onDone();
  }

  return (
    <div className="cl-card">
      <div className="cl-form-row">
        <span className="cl-form-label">Med</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Donepezil, paracetamol, etc."
        />
      </div>
      <div className="cl-form-row">
        <span className="cl-form-label">Dose</span>
        <input
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="5mg, one tablet, 5ml, etc."
        />
      </div>
      <div className="cl-form-row">
        <span className="cl-form-label">Schedule</span>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="3x daily, every 6 hours, morning + evening, as needed."
        />
      </div>
      <div className="cl-form-actions">
        <button
          type="button"
          className="cl-btn"
          data-variant="primary"
          data-size="sm"
          disabled={!name.trim()}
          onClick={submit}
        >
          Add
        </button>
        <button type="button" className="cl-btn" data-variant="ghost" data-size="sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
