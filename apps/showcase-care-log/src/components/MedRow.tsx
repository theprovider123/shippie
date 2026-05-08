/**
 * One row in the active-meds list.
 *
 * Shows name + dose + schedule, last-given pill, "give now" button.
 * Voice rule: never characterise the recipient. The action verb is
 * "Mark dose given" — past tense, factual.
 */
import type { MedDose, MedItem } from '../sync/care-doc.ts';
import type { CaregiverRole } from '../sync/pairing.ts';
import { isOverdue, nextDueAfter, parseSchedule } from '../lib/med-schedule.ts';

interface Props {
  med: MedItem;
  lastDose: MedDose | undefined;
  viewer: CaregiverRole;
  onLog: (medId: string) => void;
  onMarkMissed: (medId: string) => void;
  onDeactivate: (medId: string) => void;
}

function relTime(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MedRow({ med, lastDose, viewer, onLog, onMarkMissed, onDeactivate }: Props) {
  const sched = parseSchedule(med.schedule_text);
  const next = nextDueAfter(sched, lastDose?.given_at ?? null);
  const overdue = isOverdue(next);

  const lastBy = lastDose
    ? lastDose.given_by === viewer
      ? 'you'
      : 'the other caregiver'
    : null;

  return (
    <div className="cl-med-row" data-overdue={overdue}>
      <div className="cl-med-head">
        <span className="cl-med-name">{med.name}</span>
        {overdue ? <span className="cl-med-tag" data-tone="warn">overdue</span> : null}
      </div>
      <div className="cl-med-detail">
        {med.dose}
        {med.schedule_text ? ` · ${med.schedule_text}` : ''}
      </div>
      {lastDose ? (
        <div className="cl-med-last">
          {lastDose.missed ? 'Marked missed' : 'Last given'} by {lastBy}, {relTime(lastDose.given_at)}.
          {lastDose.note ? ` "${lastDose.note}"` : ''}
        </div>
      ) : (
        <div className="cl-med-last">No doses logged yet.</div>
      )}
      {next !== null && sched.kind !== 'as-needed' ? (
        <div className="cl-med-next">
          {overdue ? 'Was due ' : 'Next due '}{fmtClock(next)}.
        </div>
      ) : sched.kind === 'unparseable' && med.schedule_text ? (
        <div className="cl-med-next cl-mute">Schedule is free-text — log when given.</div>
      ) : null}
      <div className="cl-med-row-actions">
        <button
          type="button"
          className="cl-btn"
          data-variant="primary"
          data-size="sm"
          onClick={() => onLog(med.id)}
        >
          Mark dose given
        </button>
        <button
          type="button"
          className="cl-btn"
          data-variant="ghost"
          data-size="sm"
          onClick={() => onMarkMissed(med.id)}
        >
          Missed
        </button>
        <button
          type="button"
          className="cl-btn"
          data-variant="ghost"
          data-size="sm"
          onClick={() => onDeactivate(med.id)}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
