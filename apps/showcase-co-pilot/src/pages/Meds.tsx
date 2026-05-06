/**
 * Meds — list of active meds. Add a med, log a dose, view recent timeline.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { ParentRole } from '../sync/pairing.ts';
import {
  addMed,
  deactivateMed,
  logMedDose,
  readActiveMeds,
  readDosesForMed,
  readMedDoses,
  type MedItem,
  type MedDose,
} from '../sync/coparent-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { MedRow } from '../components/MedRow.tsx';
import { ParentPill } from '../components/ParentPill.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: ParentRole;
}

export function MedsPage({ doc, viewer }: Props) {
  const meds = useYjs(doc, (d): readonly MedItem[] => readActiveMeds(d));
  const allDoses = useYjs(doc, (d): readonly MedDose[] => readMedDoses(d));
  const [adding, setAdding] = useState(false);

  function lastDoseFor(medId: string) {
    return readDosesForMed(doc, medId, 1)[0];
  }

  function logDose(medId: string) {
    const dose = logMedDose(doc, medId, viewer);
    emitIntent('coparent-med-given', { med_id: medId, given_at: dose.given_at, given_by: viewer });
  }

  const recentDoses = [...allDoses].sort((a, b) => b.given_at - a.given_at).slice(0, 10);
  const medsById = new Map(meds.map((m) => [m.id, m]));

  return (
    <section>
      <p className="co-page-eyebrow">Meds</p>
      <h2 className="co-page-title">Doses, both phones.</h2>

      <div className="co-section">
        <div className="co-section-head">
          <h3 className="co-section-title">Active meds</h3>
          <button
            type="button"
            className="co-btn"
            data-size="sm"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? 'Cancel' : 'Add med'}
          </button>
        </div>

        {adding ? <AddMedForm doc={doc} onDone={() => setAdding(false)} /> : null}

        {meds.length === 0 ? (
          <p className="co-empty">No active meds.</p>
        ) : (
          meds.map((med) => (
            <MedRow
              key={med.id}
              med={med}
              lastDose={lastDoseFor(med.id)}
              viewer={viewer}
              onLog={logDose}
              onDeactivate={(id) => deactivateMed(doc, id)}
            />
          ))
        )}
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <h3 className="co-section-title">Recent doses</h3>
        </div>
        {recentDoses.length === 0 ? (
          <p className="co-empty">No doses logged yet.</p>
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
              <div key={dose.id} className="co-card co-card-tight">
                <div className="co-row">
                  <ParentPill role={dose.given_by} viewer={viewer} />
                  <span className="co-mute" style={{ fontSize: '0.875rem' }}>
                    {med ? `${med.med_name} for ${med.kid_name}` : 'unknown med'}
                  </span>
                  <span className="co-row-end co-mute" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}>
                    {date}
                  </span>
                </div>
                {dose.note ? <div className="co-mute" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{dose.note}</div> : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function AddMedForm({ doc, onDone }: { doc: Y.Doc; onDone: () => void }) {
  const [kid, setKid] = useState('');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [schedule, setSchedule] = useState('');

  function submit() {
    if (!kid.trim() || !name.trim()) return;
    addMed(doc, {
      kid_name: kid,
      med_name: name,
      dose,
      schedule_text: schedule,
    });
    onDone();
  }

  return (
    <div className="co-card">
      <div className="co-form-row">
        <span className="co-form-label">Kid</span>
        <input
          value={kid}
          onChange={(e) => setKid(e.target.value)}
          placeholder="Name or initial"
        />
      </div>
      <div className="co-form-row">
        <span className="co-form-label">Med</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Calpol, montelukast, etc."
        />
      </div>
      <div className="co-form-row">
        <span className="co-form-label">Dose</span>
        <input
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="5ml, one tablet, etc."
        />
      </div>
      <div className="co-form-row">
        <span className="co-form-label">Schedule</span>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="As needed, mornings, every 4 hours."
        />
      </div>
      <div className="co-form-actions">
        <button
          type="button"
          className="co-btn"
          data-variant="primary"
          data-size="sm"
          disabled={!kid.trim() || !name.trim()}
          onClick={submit}
        >
          Add
        </button>
        <button type="button" className="co-btn" data-variant="ghost" data-size="sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
