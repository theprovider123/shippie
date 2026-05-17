/**
 * History — completed workouts, scrollable, with duplicate-last-workout
 * as a primary action.
 */
import { useEffect, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  listSetsForWorkout,
  listWorkoutSteps,
  startBlankWorkout,
  addStepToWorkout,
} from '../db/queries.ts';
import type { SetRow, Workout, WorkoutStep } from '../db/schema.ts';

interface WorkoutDetail {
  workout: Workout;
  steps: WorkoutStep[];
  sets: SetRow[];
}

export function HistoryPage() {
  const lift = useLift();
  const [details, setDetails] = useState<Record<string, WorkoutDetail>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, WorkoutDetail> = {};
      for (const w of lift.recentWorkouts) {
        if (!w.completed_at) continue;
        const [steps, sets] = await Promise.all([
          listWorkoutSteps(lift.db, w.id),
          listSetsForWorkout(lift.db, w.id),
        ]);
        if (cancelled) return;
        next[w.id] = { workout: w, steps, sets };
      }
      if (!cancelled) setDetails(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.recentWorkouts, lift.db]);

  const completed = lift.recentWorkouts.filter((w) => w.completed_at);
  const previous = completed[0];

  return (
    <div className="lift-page">
      <header className="lift-history__head">
        <h1 className="lift-h1">History</h1>
        {previous ? (
          <button
            type="button"
            className="lift-primary-btn lift-history__duplicate"
            onClick={async () => {
              const detail = details[previous.id];
              if (!detail) return;
              const w = await startBlankWorkout(lift.db);
              for (const step of detail.steps) {
                await addStepToWorkout(
                  lift.db,
                  w.id,
                  step.exercise_id,
                  step.variant_id ?? null,
                );
              }
              await lift.refresh();
              lift.setTab('today');
            }}
          >
            Duplicate last workout
          </button>
        ) : null}
      </header>

      {completed.length === 0 ? (
        <p className="lift-empty">No completed workouts yet.</p>
      ) : null}

      <ul className="lift-history__list">
        {completed.map((w) => {
          const d = details[w.id];
          return (
            <li key={w.id} className="lift-history__row">
              <header className="lift-history__row-head">
                <p className="lift-history__date">{formatDate(w.started_at)}</p>
                <p className="lift-history__count">
                  {d ? `${d.steps.length} exercises · ${d.sets.length} sets` : '…'}
                </p>
              </header>
              {d ? <WorkoutSummary detail={d} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WorkoutSummary({ detail }: { detail: WorkoutDetail }) {
  const lift = useLift();
  return (
    <ul className="lift-history__exercises">
      {detail.steps.map((step) => {
        const exercise = lift.exercises.find((e) => e.id === step.exercise_id);
        const sets = detail.sets.filter((s) => s.step_id === step.id);
        const top = sets.reduce<SetRow | null>(
          (acc, s) => (acc && acc.weight >= s.weight ? acc : s),
          null,
        );
        return (
          <li key={step.id} className="lift-history__exercise-row">
            <span className="lift-history__exercise-name">
              {exercise?.name ?? '(unknown)'}
            </span>
            <span className="lift-history__exercise-best">
              {top ? `${top.weight}${top.unit} × ${top.reps}` : '—'}
            </span>
            <span className="lift-history__exercise-sets">{sets.length} sets</span>
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
