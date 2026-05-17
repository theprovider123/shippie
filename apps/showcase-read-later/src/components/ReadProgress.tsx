/**
 * Reading-progress bar pinned to the top of the reader. Updates from
 * the page's scroll handler — purely visual.
 */
import { formatRemaining } from '../lib/read-time.ts';

interface ReadProgressProps {
  progress: number;
  totalMinutes: number;
}

export function ReadProgress({ progress, totalMinutes }: ReadProgressProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const remaining = formatRemaining(progress, totalMinutes);
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${pct.toFixed(1)}%` }} />
      {remaining ? <span className="progress-label">{remaining}</span> : null}
    </div>
  );
}
