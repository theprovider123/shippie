/**
 * SymptomLogRow — one row in the recent-symptoms list.
 *
 * Renders intensity as a 1-5 bar (or "yes" for intensity 0), the
 * recipient-respectful caption, and who logged it.
 */
import type { SymptomEntry } from '../sync/care-doc.ts';
import type { CaregiverRole } from '../sync/pairing.ts';
import { CaregiverPill } from './CaregiverPill.tsx';

interface Props {
  entry: SymptomEntry;
  recipientName: string;
  viewer: CaregiverRole;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SymptomLogRow({ entry, recipientName, viewer }: Props) {
  const subject = recipientName || 'the recipient';
  // Voice: "Mum reported headache 4/5 at 11am" — neutral, factual.
  return (
    <div className="cl-symptom-row">
      <div className="cl-symptom-head">
        <span className="cl-symptom-label">{entry.label}</span>
        {entry.intensity >= 1 ? (
          <span className="cl-intensity">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="cl-intensity-bar"
                data-on={i < entry.intensity}
              />
            ))}
            <span className="cl-mute" style={{ marginLeft: '0.375rem' }}>
              {entry.intensity}/5
            </span>
          </span>
        ) : (
          <span className="cl-mute">noted</span>
        )}
      </div>
      <p className="cl-symptom-body">
        {subject} {entry.intensity >= 1 ? 'reported' : 'noted'} {entry.label}
        {entry.intensity >= 1 ? ` ${entry.intensity}/5` : ''} at {fmtTime(entry.occurred_at)}.
        {entry.note ? ` "${entry.note}"` : ''}
      </p>
      <div className="cl-symptom-meta">
        <CaregiverPill role={entry.logged_by} viewer={viewer} />
      </div>
    </div>
  );
}
