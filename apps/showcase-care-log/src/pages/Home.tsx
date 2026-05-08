/**
 * Home — today's view.
 *
 * Surfaces:
 *   - Recipient name (if set) + sync status
 *   - Medications due (red if overdue)
 *   - Recent symptoms (top 3, link to log)
 *   - Handover inbox (top 3, link to thread)
 */
import type * as Y from 'yjs';
import type { CaregiverRole } from '../sync/pairing.ts';
import {
  ackHandoverNote,
  deactivateMed,
  logMedDose,
  readActiveMeds,
  readDosesForMed,
  readMedDoses,
  readMeta,
  readSymptomsRecent,
  readUnreadHandoverFor,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { MedRow } from '../components/MedRow.tsx';
import { SymptomLogRow } from '../components/SymptomLogRow.tsx';
import { HandoverEntry } from '../components/HandoverEntry.tsx';
import { WhoseTurnPill } from '../components/WhoseTurnPill.tsx';
import { emitIntent } from '../app/intents.ts';
import type { Route } from '../router.ts';

interface Props {
  doc: Y.Doc;
  viewer: CaregiverRole;
  solo: boolean;
  onNavigate: (route: Route) => void;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HomePage({ doc, viewer, solo, onNavigate }: Props) {
  const meta = useYjs(doc, (d) => readMeta(d));
  const meds = useYjs(doc, (d) => readActiveMeds(d));
  const allDoses = useYjs(doc, (d) => readMedDoses(d));
  const symptoms = useYjs(doc, (d) => readSymptomsRecent(d, 3));
  const unread = useYjs(doc, (d) => readUnreadHandoverFor(d, viewer));

  const recentDoses = [...allDoses].sort((a, b) => b.given_at - a.given_at);

  function lastDoseFor(medId: string) {
    return readDosesForMed(doc, medId, 1)[0];
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

  return (
    <section>
      <p className="cl-page-eyebrow">Today</p>
      <h2 className="cl-page-title">
        {meta.recipient_name ? `${meta.recipient_name}'s care` : 'Care log'}
      </h2>
      <p className="cl-mute" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        {formatDateLong(new Date())}
      </p>

      <WhoseTurnPill recentDoses={recentDoses} viewer={viewer} solo={solo} />

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Medications</h3>
          <button
            type="button"
            className="cl-btn"
            data-size="sm"
            data-variant="ghost"
            onClick={() => onNavigate('meds')}
          >
            Manage meds
          </button>
        </div>
        {meds.length === 0 ? (
          <p className="cl-empty">No active medications.</p>
        ) : (
          meds.map((med) => (
            <MedRow
              key={med.id}
              med={med}
              lastDose={lastDoseFor(med.id)}
              viewer={viewer}
              onLog={(id) => logDose(id, false)}
              onMarkMissed={(id) => logDose(id, true)}
              onDeactivate={(id) => deactivateMed(doc, id)}
            />
          ))
        )}
      </div>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Recent symptoms</h3>
          <button
            type="button"
            className="cl-btn"
            data-size="sm"
            data-variant="ghost"
            onClick={() => onNavigate('symptoms')}
          >
            Log a symptom
          </button>
        </div>
        {symptoms.length === 0 ? (
          <p className="cl-empty">No symptoms logged yet.</p>
        ) : (
          symptoms.map((s) => (
            <SymptomLogRow
              key={s.id}
              entry={s}
              recipientName={meta.recipient_name}
              viewer={viewer}
            />
          ))
        )}
      </div>

      {!solo ? (
        <div className="cl-section">
          <div className="cl-section-head">
            <h3 className="cl-section-title">Handover inbox</h3>
            <button
              type="button"
              className="cl-btn"
              data-size="sm"
              data-variant="ghost"
              onClick={() => onNavigate('handover')}
            >
              Open thread
            </button>
          </div>
          {unread.length === 0 ? (
            <p className="cl-empty">Nothing unread.</p>
          ) : (
            unread.slice(0, 3).map((entry) => (
              <HandoverEntry
                key={entry.id}
                entry={entry}
                viewer={viewer}
                onAck={(id) => ackHandoverNote(doc, id, viewer)}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
