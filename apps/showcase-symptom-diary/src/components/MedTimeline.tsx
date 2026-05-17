/**
 * MedTimeline — one strip per active medication, dose-count per day.
 *
 * Bars are rendered as filled cells (not heights) because the question
 * "did the dose happen?" is binary in clinical reading. Doctor sees:
 *   ████ ████ ░░░░ ████  (oh, missed a dose Wednesday)
 *
 * Cells with multiple doses get a stacked dot for distinctness.
 */
import type { MedTimelineBin } from '../lib/chart-data.ts';
import { shortDayLabel } from '../lib/chart-data.ts';

export interface MedTimelineSeries {
  medicationId: string;
  medicationName: string;
  dose?: string | null;
  schedule?: string | null;
  bins: MedTimelineBin[];
  total: number;
}

interface Props {
  series: MedTimelineSeries[];
}

export function MedTimeline({ series }: Props) {
  if (series.length === 0) {
    return null;
  }
  return (
    <div className="med-timeline">
      <ol className="med-timeline-list">
        {series.map((s) => (
          <li key={s.medicationId} className="med-timeline-row">
            <div className="med-timeline-label">
              <strong>{s.medicationName}</strong>
              {s.dose ? <span className="muted small"> · {s.dose}</span> : null}
              {s.schedule ? <div className="muted small">{s.schedule}</div> : null}
            </div>
            <ol className="med-timeline-cells">
              {s.bins.map((bin) => (
                <li
                  key={bin.day}
                  className={`med-cell med-cell-${bin.count === 0 ? 'empty' : 'filled'}`}
                  title={`${bin.day}: ${bin.count} ${bin.count === 1 ? 'dose' : 'doses'}`}
                  aria-label={`${shortDayLabel(bin.day)}: ${bin.count} ${
                    bin.count === 1 ? 'dose' : 'doses'
                  }`}
                >
                  {bin.count > 1 ? <span className="med-cell-count">{bin.count}</span> : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
