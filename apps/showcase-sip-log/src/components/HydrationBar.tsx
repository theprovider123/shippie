/**
 * Today's hydration progress bar — water ml vs target.
 */
import type { HydrationProgress } from '../lib/targets.ts';

interface HydrationBarProps {
  progress: HydrationProgress;
  streak: number;
}

export function HydrationBar({ progress, streak }: HydrationBarProps) {
  const pct = Math.round(progress.pct * 100);
  return (
    <section className="card hydration-card" aria-label="Today's hydration">
      <header className="card-header">
        <p className="eyebrow">today · hydration</p>
        {streak > 0 ? (
          <p className="streak-pill" title={`${streak} day water-target streak`}>
            <span aria-hidden="true">·</span> {streak}d streak
          </p>
        ) : null}
      </header>
      <p className="big">
        {progress.ml}
        <span className="unit">ml</span>
      </p>
      <div className="bar" aria-label={`${pct}% of daily target`}>
        <div className="bar-fill bar-fill-water" style={{ width: `${pct}%` }} />
      </div>
      <p className="small muted">
        {progress.met
          ? `target hit · ${progress.ml - progress.target_ml}ml over`
          : `${progress.remaining_ml}ml to go · target ${progress.target_ml}ml`}
      </p>
    </section>
  );
}
