/**
 * One row in the active-meds list.
 *
 * Shows the kid, med name, dose + schedule, and last-given info.
 * "Log dose" attaches the viewer role server-side via doc; "Mark inactive"
 * preserves the history but hides from active list.
 */
import type { MedItem, MedDose } from '../sync/coparent-doc.ts';
import type { ParentRole } from '../sync/pairing.ts';

interface Props {
  med: MedItem;
  lastDose: MedDose | undefined;
  viewer: ParentRole;
  onLog: (medId: string) => void;
  onDeactivate: (medId: string) => void;
}

function relTime(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m}m ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h}h ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `${d}d ago`;
}

export function MedRow({ med, lastDose, viewer, onLog, onDeactivate }: Props) {
  const lastBy = lastDose
    ? lastDose.given_by === viewer
      ? 'you'
      : 'the other parent'
    : null;
  return (
    <div className="co-med-row">
      <div className="co-med-head">
        <span className="co-med-name">{med.med_name}</span>
        <span className="co-med-kid">{med.kid_name}</span>
      </div>
      <div className="co-med-detail">
        {med.dose}
        {med.schedule_text ? ` · ${med.schedule_text}` : ''}
      </div>
      {lastDose ? (
        <div className="co-med-last">
          Last dose: {lastBy}, {relTime(lastDose.given_at)}.
          {lastDose.note ? ` "${lastDose.note}"` : ''}
        </div>
      ) : (
        <div className="co-med-last">No doses logged yet.</div>
      )}
      <div className="co-med-row-actions">
        <button
          type="button"
          className="co-btn"
          data-variant="primary"
          data-size="sm"
          onClick={() => onLog(med.id)}
        >
          Log dose
        </button>
        <button
          type="button"
          className="co-btn"
          data-variant="ghost"
          data-size="sm"
          onClick={() => onDeactivate(med.id)}
        >
          Mark inactive
        </button>
      </div>
    </div>
  );
}
