/**
 * Print-PDF report. Activates a `printable` body class when shown so
 * `@media print` rules suppress chrome and lay out the report cleanly.
 *
 * Sections:
 *  - Header: app title, date generated, span covered
 *  - Current bests per variant (table)
 *  - 6-week trend per main lift (sparkline)
 *  - Last 5 workouts (list)
 *  - Privacy footer ("All data on this device. Not uploaded.")
 */
import { useEffect, useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  listSetsForWorkout,
  listWorkoutSteps,
  workingSetsForVariant,
} from '../db/queries.ts';
import { repRange, REP_RANGES } from '../utils/pr-detect.ts';
import type { Exercise, RepRange, SetRow, Workout, WorkoutStep } from '../db/schema.ts';

interface VariantBest {
  exercise: Exercise;
  best: SetRow | null;
  byRange: Partial<Record<RepRange, SetRow>>;
  workingSets: SetRow[];
}

export function PrintView() {
  const lift = useLift();
  const [variantBests, setVariantBests] = useState<VariantBest[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<
    { workout: Workout; steps: WorkoutStep[]; sets: SetRow[] }[]
  >([]);

  useEffect(() => {
    document.body.classList.add('lift-printable');
    return () => {
      document.body.classList.remove('lift-printable');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bests: VariantBest[] = [];
      for (const ex of lift.exercises) {
        if (!ex.variant_id) continue;
        const sets = await workingSetsForVariant(lift.db, ex.variant_id);
        if (cancelled) return;
        if (sets.length === 0) continue;
        const overall = sets.reduce<SetRow | null>((acc, s) => {
          if (!acc) return s;
          if (s.weight > acc.weight) return s;
          if (s.weight === acc.weight && s.reps > acc.reps) return s;
          return acc;
        }, null);
        const byRange: Partial<Record<RepRange, SetRow>> = {};
        for (const s of sets) {
          const r = repRange(s.reps);
          const cur = byRange[r];
          if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
            byRange[r] = s;
          }
        }
        bests.push({ exercise: ex, best: overall, byRange, workingSets: sets });
      }
      const recent = [];
      for (const w of lift.recentWorkouts.slice(0, 5)) {
        if (!w.completed_at) continue;
        const [steps, sets] = await Promise.all([
          listWorkoutSteps(lift.db, w.id),
          listSetsForWorkout(lift.db, w.id),
        ]);
        if (cancelled) return;
        recent.push({ workout: w, steps, sets });
      }
      if (!cancelled) {
        setVariantBests(bests);
        setRecentWorkouts(recent);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.exercises, lift.recentWorkouts, lift.db]);

  const generated = useMemo(() => new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }), []);

  return (
    <div className="lift-print-root">
      <div className="lift-print-controls">
        <button
          type="button"
          className="lift-secondary-btn"
          onClick={() => lift.setTab('today')}
        >
          ← Back
        </button>
        <button
          type="button"
          className="lift-primary-btn"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>

      <article className="lift-print-doc">
        <header className="lift-print-header">
          <p className="lift-print-eyebrow">Lift — Strength Report</p>
          <h1 className="lift-print-title">Current bests and 6-week trend</h1>
          <p className="lift-print-date">Generated {generated}</p>
        </header>

        <section className="lift-print-section">
          <h2 className="lift-print-h2">Current bests by exercise</h2>
          <table className="lift-print-table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Best</th>
                {REP_RANGES.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variantBests.map((vb) => (
                <tr key={vb.exercise.id}>
                  <td>{vb.exercise.name}</td>
                  <td>
                    {vb.best
                      ? `${formatWeight(vb.best.weight)}${vb.best.unit} × ${vb.best.reps}`
                      : '—'}
                  </td>
                  {REP_RANGES.map((r) => {
                    const s = vb.byRange[r];
                    return (
                      <td key={r}>
                        {s ? `${formatWeight(s.weight)}×${s.reps}` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {variantBests.length === 0 ? (
                <tr><td colSpan={REP_RANGES.length + 2}>No data yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="lift-print-section">
          <h2 className="lift-print-h2">6-week trend (working weight)</h2>
          {variantBests
            .filter((vb) => vb.workingSets.length >= 3)
            .map((vb) => (
              <div key={vb.exercise.id} className="lift-print-trend">
                <p className="lift-print-trend-name">{vb.exercise.name}</p>
                <PrintSparkline sets={vb.workingSets} unit={vb.exercise.default_unit} />
              </div>
            ))}
          {variantBests.every((vb) => vb.workingSets.length < 3) ? (
            <p className="lift-print-empty">Not enough sessions for a trend yet.</p>
          ) : null}
        </section>

        <section className="lift-print-section">
          <h2 className="lift-print-h2">Last 5 workouts</h2>
          <ol className="lift-print-workouts">
            {recentWorkouts.map((rw) => (
              <li key={rw.workout.id}>
                <p className="lift-print-workout-date">
                  {new Date(rw.workout.started_at).toLocaleDateString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </p>
                <ul className="lift-print-workout-exs">
                  {rw.steps.map((step) => {
                    const ex = lift.exercises.find((e) => e.id === step.exercise_id);
                    const sets = rw.sets.filter((s) => s.step_id === step.id && s.set_type === 'working');
                    if (sets.length === 0) return null;
                    return (
                      <li key={step.id}>
                        <strong>{ex?.name ?? '(unknown)'}</strong>
                        {' '}— {sets.map((s) => `${formatWeight(s.weight)}×${s.reps}`).join(', ')}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {recentWorkouts.length === 0 ? <li>No completed workouts yet.</li> : null}
          </ol>
        </section>

        <footer className="lift-print-footer">
          <p>
            Generated by Lift on this device. All data — every set, every PR, every photo —
            is stored locally and was never uploaded.
          </p>
        </footer>
      </article>
    </div>
  );
}

function PrintSparkline({ sets, unit }: { sets: readonly SetRow[]; unit: string }) {
  const ordered = [...sets].sort(
    (a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
  );
  if (ordered.length < 2) return null;
  const minW = Math.min(...ordered.map((s) => s.weight));
  const maxW = Math.max(...ordered.map((s) => s.weight));
  const span = maxW - minW || 1;
  const W = 480;
  const H = 60;
  const PAD = 4;
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;
  const points = ordered.map((s, i) => {
    const x = PAD + (i / (ordered.length - 1)) * innerW;
    const y = PAD + innerH - ((s.weight - minW) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  return (
    <div className="lift-print-spark">
      <svg viewBox={`0 0 ${W} ${H}`} className="lift-print-spark-svg" aria-hidden="true">
        <path d={path} className="lift-print-spark-line" />
      </svg>
      <p className="lift-print-spark-bounds">
        {formatWeight(minW)}{unit} → {formatWeight(maxW)}{unit} · {ordered.length} sets
      </p>
    </div>
  );
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, '');
}
