import { useEffect, useState } from 'react';
import type { Bake } from '../db.ts';
import {
  formatClock,
  formatDayClock,
  formatHM,
  planFromStart,
  positionOnSchedule,
} from '../lib/schedule.ts';

interface Props {
  bake: Bake;
  onOpen: () => void;
}

/**
 * Active-bake card. Shows current stage + remaining time, ticking
 * every minute. Used on the Active Bakes page list.
 */
export function BakeCard({ bake, onOpen }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const start = new Date(bake.started_at);
  const plan = planFromStart(bake.recipe_snapshot.stages, start);
  const pos = positionOnSchedule(plan, new Date());
  const stage =
    pos.stageIndex >= 0 && pos.stageIndex < plan.stages.length
      ? plan.stages[pos.stageIndex]
      : null;
  const ready = new Date(bake.ready_at);
  const overdue = pos.stageIndex >= plan.stages.length;

  return (
    <button type="button" className="bake-card" onClick={onOpen}>
      <div className="bake-card-head">
        <strong>{bake.recipe_name}</strong>
        <span className="muted small">{bake.total_g}g</span>
      </div>
      <div className="bake-card-status">
        {overdue ? (
          <span className="bake-status overdue">ready · check it</span>
        ) : stage ? (
          <span className="bake-status">
            {stage.label} ·{' '}
            <span className="muted small">
              {formatHM(Math.max(0, pos.remainingMin))} left
            </span>
          </span>
        ) : (
          <span className="bake-status">starts {formatDayClock(start)}</span>
        )}
      </div>
      <div className="bake-card-bar" aria-hidden="true">
        <div
          className="bake-card-bar-fill"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, pos.totalProgress)) * 100)}%` }}
        />
      </div>
      <p className="muted small">
        ready {formatDayClock(ready)} · {formatClock(ready)}
      </p>
    </button>
  );
}
