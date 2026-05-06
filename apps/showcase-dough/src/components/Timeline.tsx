import { useEffect, useState } from 'react';
import {
  formatClock,
  formatHM,
  positionOnSchedule,
  type PlannedSchedule,
} from '../lib/schedule.ts';

interface Props {
  plan: PlannedSchedule;
  /** Stage index that the user has tapped to expand. -1 = none. */
  expandedIndex: number;
  onSelect: (index: number) => void;
  /** Override "now" for testing / preview. Default is real wall-clock. */
  now?: Date;
}

/**
 * Vertical timeline. Each stage is a row with label + clock + duration.
 * The "now" indicator is a glowing band that scrubs forward as time
 * passes. Tapping a stage opens its prompt below.
 */
export function Timeline({ plan, expandedIndex, onSelect, now }: Props) {
  // Re-render every minute so the now-indicator keeps moving.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (now) return; // fixed clock; no ticker
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [now]);

  const wallNow = now ?? new Date();
  const pos = positionOnSchedule(plan, wallNow);
  void tick; // keep the lint quiet — wallNow already pulls a fresh Date()

  return (
    <ol className="timeline">
      {plan.stages.map((s, i) => {
        const active = pos.stageIndex === i;
        const past = pos.stageIndex > i;
        const expanded = expandedIndex === i;
        return (
          <li
            key={`${s.kind}-${i}`}
            className={`timeline-row ${active ? 'active' : past ? 'past' : ''} ${expanded ? 'expanded' : ''}`}
          >
            <button
              type="button"
              className="timeline-head"
              onClick={() => onSelect(expanded ? -1 : i)}
              aria-expanded={expanded}
            >
              <span className="timeline-dot" aria-hidden="true">
                {past ? '✓' : i + 1}
              </span>
              <span className="timeline-text">
                <span className="timeline-label">{s.label}</span>
                <span className="timeline-time">
                  {formatClock(s.startAt)} → {formatClock(s.endAt)}
                  <span className="muted small"> · {formatHM(s.minutes)}</span>
                </span>
              </span>
              {active ? (
                <span className="timeline-now-pill" aria-label="Now">
                  now · {formatHM(Math.max(0, plan.totalMinutes - pos.elapsedMin))} left
                </span>
              ) : null}
            </button>
            {active ? (
              <div
                className="timeline-progress"
                style={{ width: `${Math.round(pos.stageProgress * 100)}%` }}
              />
            ) : null}
            {expanded ? (
              <div className="timeline-prompt">
                <p>{s.prompt}</p>
                {s.subPrompts && s.subPrompts.length > 0 ? (
                  <ul className="sub-prompts">
                    {s.subPrompts.map((sp, idx) => (
                      <li key={idx}>
                        <strong>+{formatHM(sp.offsetMin)} · {sp.label}</strong>
                        <p className="muted small">{sp.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
