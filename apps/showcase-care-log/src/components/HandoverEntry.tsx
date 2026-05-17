/**
 * One handover thread item.
 *
 * Voice rules:
 *   - Never deletable. Only ackable.
 *   - "ack" reads as "seen" to the user, but in code we keep "acked_at"
 *     because the audit trail meaning is precise.
 *   - The author can't ack their own entry.
 */
import type { HandoverNote as Entry } from '../sync/care-doc.ts';
import type { CaregiverRole } from '../sync/pairing.ts';
import { CaregiverPill } from './CaregiverPill.tsx';

interface Props {
  entry: Entry;
  viewer: CaregiverRole;
  onAck: (id: string) => void;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export function HandoverEntry({ entry, viewer, onAck }: Props) {
  const mine = entry.author === viewer;
  const canAck = !mine && !entry.acked_at;
  const ackedFmt = entry.acked_at ? fmtTime(entry.acked_at) : null;
  return (
    <article className="cl-handover-entry" data-mine={mine}>
      <div className="cl-handover-meta">
        <CaregiverPill role={entry.author} viewer={viewer} />
        <span>{fmtTime(entry.written_at)}</span>
      </div>
      <p className="cl-handover-body">{entry.body}</p>
      <div className="cl-handover-ack-row">
        {entry.acked_at ? (
          <span>Seen {ackedFmt}</span>
        ) : mine ? (
          <span>Awaiting other caregiver.</span>
        ) : null}
        {canAck ? (
          <button
            type="button"
            className="cl-btn"
            data-size="sm"
            onClick={() => onAck(entry.id)}
          >
            Mark seen
          </button>
        ) : null}
      </div>
    </article>
  );
}
