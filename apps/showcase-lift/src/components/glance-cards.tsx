/**
 * Strain + week + month summary cards. Surfaced in two places:
 *
 *   - Today's start screen (before a workout) — strain banner + this-week
 *     summary, so the deload prompt lands where the user is about to
 *     decide what to do.
 *   - Progression page — strain banner + 4-week summary, alongside the
 *     per-exercise drill-downs.
 *
 * No "Glance" page exists as a separate tab — these components are the
 * shared content.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  listSetsForWorkout,
} from '../db/queries.ts';
import { evaluateStrain, type StrainResult } from '../utils/strain.ts';
import type { SetRow, Workout } from '../db/schema.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface CompletedDetail {
  workout: Workout;
  sets: SetRow[];
}

function useCompletedWorkoutSets(): CompletedDetail[] | null {
  const lift = useLift();
  const [details, setDetails] = useState<CompletedDetail[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: CompletedDetail[] = [];
      for (const w of lift.recentWorkouts) {
        if (!w.completed_at) continue;
        const sets = await listSetsForWorkout(lift.db, w.id);
        if (cancelled) return;
        next.push({ workout: w, sets });
      }
      if (!cancelled) setDetails(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.recentWorkouts, lift.db]);

  return details;
}

export function StrainBanner() {
  const details = useCompletedWorkoutSets();
  const strain = useMemo<StrainResult | null>(() => {
    if (!details) return null;
    const all: SetRow[] = [];
    for (const d of details) {
      for (const s of d.sets) if (s.set_type === 'working') all.push(s);
    }
    return evaluateStrain({ workingSets: all });
  }, [details]);

  if (!strain || (!strain.honest && !strain.recommendDeload)) return null;

  return (
    <section
      className={`lift-glance__strain ${strain.recommendDeload ? 'lift-glance__strain--warn' : ''}`}
      role={strain.recommendDeload ? 'status' : undefined}
    >
      <p className="lift-glance__strain-head">
        {strain.recommendDeload ? 'Deload week recommended' : '4-week strain'}
      </p>
      <p className="lift-glance__strain-body">{strain.reason}</p>
    </section>
  );
}

export function WeekSummary() {
  const details = useCompletedWorkoutSets();
  const week = useMemo(() => buildWeekStats(details ?? []), [details]);

  if (!details || details.length === 0) return null;

  return (
    <section className="lift-glance__week">
      <p className="lift-section-label">This week</p>
      <div className="lift-glance__week-grid">
        <Metric label="Sessions" value={String(week.sessions)} />
        <Metric label="Sets" value={String(week.sets)} />
        <Metric label="Tonnage" value={String(Math.round(week.tonnage))} />
      </div>
      <DistributionBars values={week.dailyTonnage} />
    </section>
  );
}

export function MonthSummary() {
  const details = useCompletedWorkoutSets();
  const month = useMemo(() => buildMonthStats(details ?? []), [details]);

  if (!details || details.length === 0) return null;

  return (
    <section className="lift-glance__month">
      <p className="lift-section-label">Last 4 weeks</p>
      <div className="lift-glance__week-grid">
        <Metric label="Sessions" value={String(month.sessions)} />
        <Metric label="Tonnage" value={String(Math.round(month.tonnage))} />
        <Metric
          label="Per session"
          value={month.sessions === 0 ? '—' : String(Math.round(month.tonnage / month.sessions))}
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="lift-glance__metric">
      <span className="lift-glance__metric-label">{label}</span>
      <span className="lift-glance__metric-value">{value}</span>
    </div>
  );
}

interface WeekStats {
  sessions: number;
  sets: number;
  tonnage: number;
  /** Tonnage per day for the last 7 days (oldest → newest). */
  dailyTonnage: number[];
}

function buildWeekStats(completed: readonly CompletedDetail[]): WeekStats {
  const now = Date.now();
  const weekAgo = now - WEEK_MS;
  const dailyTonnage = new Array(7).fill(0);
  let sessions = 0;
  let sets = 0;
  let tonnage = 0;
  for (const c of completed) {
    const t = Date.parse(c.workout.completed_at ?? c.workout.started_at);
    if (t < weekAgo) continue;
    sessions += 1;
    for (const s of c.sets) {
      if (s.set_type !== 'working') continue;
      sets += 1;
      const ton = s.weight * s.reps;
      tonnage += ton;
      const daysAgo = Math.min(6, Math.max(0, Math.floor((now - Date.parse(s.completed_at)) / DAY_MS)));
      dailyTonnage[6 - daysAgo] += ton;
    }
  }
  return { sessions, sets, tonnage, dailyTonnage };
}

interface MonthStats {
  sessions: number;
  tonnage: number;
}

function buildMonthStats(completed: readonly CompletedDetail[]): MonthStats {
  const cutoff = Date.now() - 4 * WEEK_MS;
  let sessions = 0;
  let tonnage = 0;
  for (const c of completed) {
    const t = Date.parse(c.workout.completed_at ?? c.workout.started_at);
    if (t < cutoff) continue;
    sessions += 1;
    for (const s of c.sets) {
      if (s.set_type === 'working') tonnage += s.weight * s.reps;
    }
  }
  return { sessions, tonnage };
}

function DistributionBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const today = new Date();
  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    dayLabels.push(d.toLocaleDateString(undefined, { weekday: 'narrow' }));
  }
  return (
    <div className="lift-glance__bars" aria-label="Daily tonnage distribution">
      {values.map((v, i) => (
        <div key={i} className="lift-glance__bar-col">
          <div
            className="lift-glance__bar"
            style={{ height: `${Math.max(2, (v / max) * 60)}px` }}
            data-empty={v === 0}
          />
          <span className="lift-glance__bar-label">{dayLabels[i]}</span>
        </div>
      ))}
    </div>
  );
}
