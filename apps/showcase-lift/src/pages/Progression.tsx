/**
 * Progression — the differentiator screen.
 *
 * Hero answers "how am I getting stronger on bench?":
 *   - Plain-language headline
 *   - Recent variant PR
 *   - Best sets by rep range (1-3 / 4-6 / 7-10 / 11-15 / 16+)
 *   - Honest line chart underneath as supporting evidence
 *
 * Honest mode: when an exercise has < 2 sessions, show "no clear trend
 * yet" instead of fabricating a chart.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  listPrsForExercise,
  workingSetsForLineage,
  workingSetsForVariant,
} from '../db/queries.ts';
import { buildProgressSummary } from '../utils/plain-progress.ts';
import { repRange, REP_RANGES } from '../utils/pr-detect.ts';
import { bestEstimatedOneRepMax } from '../utils/one-rep-max.ts';
import { StrainBanner, MonthSummary } from '../components/glance-cards.tsx';
import { TrainingAnalytics } from '../components/analytics-cards.tsx';
import type { Exercise, Pr, RepRange, SetRow } from '../db/schema.ts';

export function ProgressionPage() {
  const lift = useLift();
  const [exerciseTotals, setExerciseTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tally: Record<string, number> = {};
      for (const ex of lift.exercises) {
        if (!ex.variant_id) continue;
        const sets = await workingSetsForVariant(lift.db, ex.variant_id);
        if (cancelled) return;
        if (sets.length > 0) tally[ex.id] = sets.length;
      }
      if (!cancelled) setExerciseTotals(tally);
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.exercises, lift.db]);

  const tracked = lift.exercises.filter((e) => exerciseTotals[e.id]);

  if (lift.selectedExerciseId) {
    const ex = lift.exercises.find((e) => e.id === lift.selectedExerciseId);
    if (ex) return <ExerciseDrillDown exercise={ex} />;
  }

  return (
    <div className="lift-page">
      <header className="lift-progression__head">
        <h1 className="lift-h1">Progression</h1>
        <p className="lift-progression__sub">
          Honest plain-language summaries. Tap an exercise for the drill-down.
        </p>
      </header>

      <StrainBanner />
      <MonthSummary />
      <TrainingAnalytics />

      {tracked.length === 0 ? (
        <p className="lift-empty">
          No clear trend yet. Log 2 more sessions to see your progression here.
        </p>
      ) : (
        <ul className="lift-progression__list">
          {tracked.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                className="lift-progression__row"
                onClick={() => lift.setSelectedExerciseId(ex.id)}
              >
                <span className="lift-progression__name">{ex.name}</span>
                <span className="lift-progression__sessions">
                  {exerciseTotals[ex.id]} sets logged
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ExerciseDrillDownProps {
  exercise: Exercise;
}

function ExerciseDrillDown({ exercise }: ExerciseDrillDownProps) {
  const lift = useLift();
  const [variantSets, setVariantSets] = useState<SetRow[]>([]);
  const [lineageSets, setLineageSets] = useState<SetRow[]>([]);
  const [prs, setPrs] = useState<Pr[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [vSets, lSets, prRows] = await Promise.all([
        exercise.variant_id
          ? workingSetsForVariant(lift.db, exercise.variant_id)
          : Promise.resolve([]),
        exercise.lineage_id
          ? workingSetsForLineage(lift.db, exercise.lineage_id)
          : Promise.resolve([]),
        listPrsForExercise(lift.db, exercise.variant_id ?? null, exercise.lineage_id ?? null),
      ]);
      if (cancelled) return;
      setVariantSets(vSets);
      setLineageSets(lSets);
      setPrs(prRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise.id, lift.db]);

  const summary = useMemo(
    () => buildProgressSummary({ workingSets: variantSets, unit: exercise.default_unit }),
    [variantSets, exercise.default_unit],
  );

  const repRangeBests = useMemo(() => {
    const map: Partial<Record<RepRange, SetRow>> = {};
    for (const s of variantSets) {
      const r = repRange(s.reps);
      const cur = map[r];
      if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
        map[r] = s;
      }
    }
    return map;
  }, [variantSets]);

  const recentVariantPr = useMemo(() => {
    return prs
      .filter((p) => p.kind === 'variant')
      .sort((a, b) => Date.parse(b.achieved_at) - Date.parse(a.achieved_at))[0] ?? null;
  }, [prs]);

  return (
    <div className="lift-page">
      <header className="lift-progression__drill-head">
        <button
          type="button"
          className="lift-secondary-btn lift-progression__back"
          onClick={() => lift.setSelectedExerciseId(null)}
        >
          ← All exercises
        </button>
        <h1 className="lift-h1">{exercise.name}</h1>
      </header>

      <section className="lift-progression__hero">
        <p className="lift-progression__headline">{summary.headline}</p>
        {(() => {
          const e1rm = bestEstimatedOneRepMax(variantSets);
          return e1rm > 0 ? (
            <p className="lift-progression__e1rm">
              Est. 1RM ≈ {formatWeight(e1rm)}
              {exercise.default_unit}
              <span className="lift-progression__e1rm-note"> · estimate, not a max attempt</span>
            </p>
          ) : null;
        })()}
        {recentVariantPr ? (
          <p className="lift-progression__recent-pr">
            Recent best: {formatWeight(recentVariantPr.weight)}
            {exercise.default_unit} × {recentVariantPr.reps} ·{' '}
            {formatRelative(recentVariantPr.achieved_at)}
          </p>
        ) : null}
      </section>

      <section className="lift-progression__rep-ranges">
        <p className="lift-section-label">Best by rep range</p>
        <ul className="lift-progression__rep-list">
          {REP_RANGES.map((r) => {
            const best = repRangeBests[r];
            return (
              <li key={r} className="lift-progression__rep-row">
                <span className="lift-progression__rep-bucket">{r} reps</span>
                <span className="lift-progression__rep-best">
                  {best ? `${formatWeight(best.weight)}${exercise.default_unit} × ${best.reps}` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {variantSets.length >= 3 ? (
        <section className="lift-progression__chart">
          <p className="lift-section-label">Working weight, all sets</p>
          <Sparkline sets={variantSets} unit={exercise.default_unit} />
        </section>
      ) : null}

      {lineageSets.length > variantSets.length ? (
        <section className="lift-progression__lineage">
          <p className="lift-section-label">Across all variants</p>
          <p className="lift-progression__lineage-count">
            {lineageSets.length} working sets across this lift.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Sparkline({ sets, unit }: { sets: readonly SetRow[]; unit: string }) {
  const ordered = [...sets].sort(
    (a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
  );
  if (ordered.length < 2) return null;
  const minW = Math.min(...ordered.map((s) => s.weight));
  const maxW = Math.max(...ordered.map((s) => s.weight));
  const span = maxW - minW || 1;
  const W = 320;
  const H = 80;
  const PAD = 6;
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;
  const points = ordered.map((s, i) => {
    const x = PAD + (i / (ordered.length - 1)) * innerW;
    const y = PAD + innerH - ((s.weight - minW) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const lastX = PAD + innerW;
  const lastY = PAD + innerH - ((ordered[ordered.length - 1]!.weight - minW) / span) * innerH;
  return (
    <div className="lift-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} className="lift-sparkline__svg" aria-hidden="true">
        <path className="lift-sparkline__line" d={path} />
        <circle className="lift-sparkline__dot" cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r={3} />
      </svg>
      <div className="lift-sparkline__bounds">
        <span>
          {formatWeight(minW)}
          {unit}
        </span>
        <span>
          {formatWeight(maxW)}
          {unit}
        </span>
      </div>
    </div>
  );
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, '');
}

function formatRelative(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
