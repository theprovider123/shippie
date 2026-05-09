import { useEffect, useMemo, useState } from 'react';
import type { Bake } from '../db.ts';
import {
  formatDayClock,
  formatHM,
  planFromStart,
  positionOnSchedule,
} from '../lib/schedule.ts';
import { Timeline } from '../components/Timeline.tsx';
import { StagePrompt } from '../components/StagePrompt.tsx';
import { OutcomeForm } from '../components/OutcomeForm.tsx';
import type { BakeOutcome } from '../db.ts';

interface Props {
  bake: Bake;
  onCancel: () => void;
  onLogOutcome: (outcome: BakeOutcome) => void;
  onAbandon: () => void;
}

/**
 * The running-bake view. Shows the current stage as a hero, the full
 * timeline below, and a "log this bake" form once the schedule has
 * passed (or the user manually marks done).
 */
export function TimelineView({ bake, onCancel, onLogOutcome, onAbandon }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number>(-1);
  const [showOutcome, setShowOutcome] = useState<boolean>(false);

  const plan = useMemo(
    () => planFromStart(bake.recipe_snapshot.stages, new Date(bake.started_at)),
    [bake.recipe_snapshot.stages, bake.started_at],
  );

  // Re-render every minute so the "current stage" stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const now = new Date();
  const pos = positionOnSchedule(plan, now);
  const currentStage =
    pos.stageIndex >= 0 && pos.stageIndex < plan.stages.length
      ? plan.stages[pos.stageIndex]
      : null;
  const overdue = pos.stageIndex >= plan.stages.length;

  if (showOutcome) {
    return (
      <main className="app">
        <header className="page-header">
          <button type="button" className="back" onClick={() => setShowOutcome(false)}>
            ← Back
          </button>
          <h1>{bake.recipe_snapshot.name}</h1>
        </header>
        <OutcomeForm
          onSubmit={onLogOutcome}
          onCancel={() => setShowOutcome(false)}
        />
      </main>
    );
  }

  return (
    <main className="app" data-shippie-wakelock>
      <header className="page-header">
        <button type="button" className="back" onClick={onCancel}>
          ← Back
        </button>
        <h1>{bake.recipe_snapshot.name}</h1>
        <p className="subtitle">
          {bake.total_g}g · started {formatDayClock(new Date(bake.started_at))}
        </p>
      </header>

      {overdue ? (
        <section className="overdue-banner">
          <p>
            <strong>Done baking?</strong>
          </p>
          <p className="muted small">
            Schedule wrapped {formatHM(Math.abs(pos.remainingMin))} ago. Log
            the outcome so the next bake learns from this one.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => setShowOutcome(true)}
          >
            Log this bake
          </button>
        </section>
      ) : currentStage ? (
        <StagePrompt stage={currentStage} />
      ) : (
        <div className="stage-prompt">
          <p className="eyebrow">starting in</p>
          <h2>{formatHM(-pos.elapsedMin)}</h2>
          <p className="muted">
            First step: <strong>{plan.stages[0]?.label}</strong>
          </p>
        </div>
      )}

      <section className="schedule">
        <p className="eyebrow">full timeline</p>
        <Timeline
          plan={plan}
          expandedIndex={expandedIdx}
          onSelect={setExpandedIdx}
        />
      </section>

      <div className="page-actions">
        <button type="button" className="ghost destructive" onClick={onAbandon}>
          Abandon bake
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setShowOutcome(true)}
        >
          Log outcome
        </button>
      </div>
    </main>
  );
}
