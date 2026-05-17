/**
 * IntensityChart — horizontal bars per day for one symptom.
 *
 * Pure CSS (no chart library). Each bin is a column; the bar height
 * is the peak / 5. Empty days get a thin baseline tick so the doctor
 * sees the gap honestly.
 *
 * Used in History and PrintView. Print-CSS specialises later in
 * styles.css to ensure ink-friendly contrast.
 */
import type { SymptomChart } from '../lib/chart-data.ts';
import { shortDayLabel } from '../lib/chart-data.ts';

interface Props {
  chart: SymptomChart;
}

export function IntensityChart({ chart }: Props) {
  const max = 5;
  return (
    <div className="intensity-chart" aria-label={`Intensity over time for ${chart.symptomName}`}>
      <div className="intensity-chart-head">
        <h3 className="intensity-chart-title">{chart.symptomName}</h3>
        <div className="intensity-chart-meta">
          {chart.totalEntries} {chart.totalEntries === 1 ? 'entry' : 'entries'}
        </div>
      </div>
      <ol className="intensity-bars">
        {chart.bins.map((bin) => {
          const heightPct = (bin.peak / max) * 100;
          return (
            <li key={bin.day} className="intensity-bin">
              <div className="intensity-bin-bar-wrap">
                <div
                  className={`intensity-bin-bar intensity-bin-bar-${bin.peak}`}
                  style={{ height: `${heightPct}%` }}
                  aria-label={`${shortDayLabel(bin.day)}: peak ${bin.peak}, ${bin.count} ${
                    bin.count === 1 ? 'entry' : 'entries'
                  }`}
                  title={`${bin.day} • peak ${bin.peak} • ${bin.count} ${
                    bin.count === 1 ? 'entry' : 'entries'
                  }`}
                />
              </div>
              <div className="intensity-bin-label">{shortDayLabel(bin.day)}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
