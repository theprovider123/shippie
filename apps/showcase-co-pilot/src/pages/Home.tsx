/**
 * Home — today's view.
 * Surfaces:
 *   - Whose-day badge (with you / with the other parent)
 *   - Recent unread handover notes (top 3, link to thread)
 *   - Active meds with their last-given info (top 3, link to Meds)
 *   - Quick "Add to handover" action
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { ParentRole } from '../sync/pairing.ts';
import {
  addHandoverEntry,
  ackHandoverEntry,
  readActiveMeds,
  readDosesForMed,
  readScheduleDay,
  readUnreadHandoverFor,
  todayISO,
  type ScheduleDay,
} from '../sync/coparent-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { WhoseDayBadge } from '../components/WhoseDayBadge.tsx';
import { HandoverEntry } from '../components/HandoverEntry.tsx';
import { MedRow } from '../components/MedRow.tsx';
import { logMedDose, deactivateMed } from '../sync/coparent-doc.ts';
import { formatDateLong } from '../state/schedule.ts';
import { emitIntent } from '../app/intents.ts';
import type { Route } from '../router.ts';

interface Props {
  doc: Y.Doc;
  viewer: ParentRole;
  onNavigate: (route: Route) => void;
}

export function HomePage({ doc, viewer, onNavigate }: Props) {
  const today = todayISO();
  const todaySchedule = useYjs(
    doc,
    (d): ScheduleDay | null => readScheduleDay(d, today),
  );
  const unread = useYjs(doc, (d) => readUnreadHandoverFor(d, viewer));
  const activeMeds = useYjs(doc, (d) => readActiveMeds(d));
  const allDoses = useYjs(doc, (d) => d.getArray('med_doses').toArray());
  const [draft, setDraft] = useState('');

  function lastDoseFor(medId: string) {
    return readDosesForMed(doc, medId, 1)[0];
  }

  function submitHandover() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const entry = addHandoverEntry(doc, viewer, trimmed);
    setDraft('');
    if (entry) emitIntent('coparent-handover-noted', { id: entry.id, written_at: entry.written_at });
  }

  function logDose(medId: string) {
    const dose = logMedDose(doc, medId, viewer);
    emitIntent('coparent-med-given', { med_id: medId, given_at: dose.given_at, given_by: viewer });
  }

  // allDoses dependency is just to force re-read; lint quiet.
  void allDoses;

  return (
    <section>
      <p className="co-page-eyebrow">Today</p>
      <h2 className="co-page-title">{formatDateLong(new Date())}</h2>

      <WhoseDayBadge viewer={viewer} today={todaySchedule} todayLabel={formatDateLong(new Date())} />

      <div className="co-section">
        <div className="co-section-head">
          <h3 className="co-section-title">Quick handover note</h3>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="PE kit packed, inhaler in front pocket, pickup at 5."
        />
        <div className="co-form-actions">
          <button
            type="button"
            className="co-btn"
            data-variant="primary"
            data-size="lg"
            disabled={!draft.trim()}
            onClick={submitHandover}
          >
            Add to handover
          </button>
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <h3 className="co-section-title">Unread handover</h3>
          <button type="button" className="co-btn" data-size="sm" data-variant="ghost" onClick={() => onNavigate('handover')}>
            Open thread
          </button>
        </div>
        {unread.length === 0 ? (
          <p className="co-empty">Nothing unread.</p>
        ) : (
          unread.slice(0, 3).map((entry) => (
            <HandoverEntry
              key={entry.id}
              entry={entry}
              viewer={viewer}
              onAck={(id) => ackHandoverEntry(doc, id, viewer)}
            />
          ))
        )}
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <h3 className="co-section-title">Active meds</h3>
          <button type="button" className="co-btn" data-size="sm" data-variant="ghost" onClick={() => onNavigate('meds')}>
            Open meds
          </button>
        </div>
        {activeMeds.length === 0 ? (
          <p className="co-empty">No active meds.</p>
        ) : (
          activeMeds.slice(0, 3).map((med) => (
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
    </section>
  );
}
