/**
 * Training analytics cards for the Progression page — consistency,
 * volume, intensity, and where the work landed by muscle group.
 *
 * Loads every completed session's working sets once, joins them to their
 * exercise for the muscle split, then runs the pure analytics functions.
 * Honest: nothing renders until there's data, and shares are real.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import { listWorkoutSteps, listSetsForStep } from '../db/queries.ts';
import {
  averageIntensityPct,
  computeConsistency,
  muscleGroupVolume,
  totalVolume,
  weeklyVolumeSeries,
  type MuscleSet,
} from '../utils/analytics.ts';

interface Loaded {
  completedAt: string[];
  muscleSets: MuscleSet[];
}

function useAnalyticsData(): Loaded | null {
  const lift = useLift();
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const muscleByExercise = new Map(lift.exercises.map((e) => [e.id, e.muscle_group]));
      const completedAt: string[] = [];
      const muscleSets: MuscleSet[] = [];
      for (const w of lift.recentWorkouts) {
        if (!w.completed_at) continue;
        completedAt.push(w.completed_at);
        const steps = await listWorkoutSteps(lift.db, w.id);
        if (cancelled) return;
        for (const step of steps) {
          const sets = await listSetsForStep(lift.db, step.id);
          if (cancelled) return;
          const muscle = muscleByExercise.get(step.exercise_id) ?? 'full-body';
          for (const s of sets) {
            if (s.set_type !== 'working') continue;
            muscleSets.push({
              weight: s.weight,
              reps: s.reps,
              completedAt: s.completed_at,
              muscleGroup: muscle,
            });
          }
        }
      }
      if (!cancelled) setData({ completedAt, muscleSets });
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.recentWorkouts, lift.exercises, lift.db]);

  return data;
}

export function TrainingAnalytics() {
  const data = useAnalyticsData();

  const computed = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    return {
      consistency: computeConsistency(data.completedAt, now),
      volume: totalVolume(data.muscleSets),
      intensity: averageIntensityPct(data.muscleSets),
      weekly: weeklyVolumeSeries(data.muscleSets, now, 8),
      muscles: muscleGroupVolume(data.muscleSets),
    };
  }, [data]);

  if (!computed || computed.muscles.length === 0) return null;

  const maxWeek = Math.max(1, ...computed.weekly);

  return (
    <section className="lift-analytics">
      <p className="lift-section-label">Training analytics</p>

      <div className="lift-analytics__grid">
        <Stat label="Streak" value={`${computed.consistency.weeklyStreak}w`} />
        <Stat label="Last 7d" value={`${computed.consistency.sessionsLast7}`} />
        <Stat label="Intensity" value={computed.intensity == null ? '—' : `${computed.intensity}%`} />
        <Stat label="Volume" value={String(computed.volume)} />
      </div>

      <div className="lift-analytics__weekly" aria-label="Weekly volume, last 8 weeks">
        {computed.weekly.map((v, i) => (
          <div key={i} className="lift-analytics__week-col">
            <div
              className="lift-analytics__week-bar"
              style={{ height: `${Math.max(2, (v / maxWeek) * 56)}px` }}
              data-empty={v === 0}
            />
          </div>
        ))}
      </div>

      <ul className="lift-analytics__muscles">
        {computed.muscles.map((m) => (
          <li key={m.muscleGroup} className="lift-analytics__muscle-row">
            <span className="lift-analytics__muscle-name">{m.muscleGroup}</span>
            <span className="lift-analytics__muscle-bar-track">
              <span className="lift-analytics__muscle-bar" style={{ width: `${m.sharePct}%` }} />
            </span>
            <span className="lift-analytics__muscle-pct">{m.sharePct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="lift-analytics__stat">
      <span className="lift-analytics__stat-value">{value}</span>
      <span className="lift-analytics__stat-label">{label}</span>
    </div>
  );
}
