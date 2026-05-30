/**
 * The active-workout screen — the soul of Lift.
 *
 * If there's an open workout, show the current step + active set card +
 * rest timer + a quiet "previous sets" reference list below. If there's
 * no open workout, show a "start" surface (template chooser + blank
 * workout button).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import { SetCard } from '../components/SetCard.tsx';
import { RestTimer } from '../components/RestTimer.tsx';
import { PRBurst, type PRBurstEvent } from '../components/PRBurst.tsx';
import { EditSetSheet } from '../components/EditSetSheet.tsx';
import { StrainBanner, WeekSummary } from '../components/glance-cards.tsx';
import {
  completeWorkout,
  deleteSet,
  insertPr,
  lastSessionWorkingSets,
  lastWorkingSetForExercise,
  listSetsForWorkout,
  logSet,
  repeatLastWorkout,
  setStepSuperset,
  startBlankWorkout,
  startWorkoutFromTemplate,
  swapStepVariant,
  updateSet,
  workingSetsForLineage,
  workingSetsForVariant,
} from '../db/queries.ts';
import { detectPrCandidates } from '../utils/pr-detect.ts';
import { evaluateStrain } from '../utils/strain.ts';
import { computeTrainingLoad } from '../utils/training-load.ts';
import { recommendProgression, type ProgressionRecommendation } from '../utils/progression.ts';
import { applyWeekLoad } from '../utils/program.ts';
import {
  getActiveProgram,
  incrementCompleted,
  setActiveProgram,
  type ActiveProgram,
} from '../lib/program-progress.ts';
import { newId } from '../utils/ids.ts';
import { createWakeLock } from '../utils/wake-lock.ts';
import { recomputePrsForExercise } from '../lib/recompute-prs.ts';
import {
  emitDeloadRecommended,
  emitPrBroken,
  emitSetLogged,
  emitTrainingLoadUpdated,
  emitWorkoutCompleted,
  emitWorkoutStarted,
} from '../lib/intent-bus.ts';
import { ReadinessBanner } from '../components/ReadinessBanner.tsx';
import type { SetRow, SetType, Unit } from '../db/schema.ts';

export function TodayPage() {
  const lift = useLift();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [restTrigger, setRestTrigger] = useState(0);
  const [defaults, setDefaults] = useState<{ weight: number; reps: number; ref: { weight: number; reps: number; daysAgo: number } | null } | null>(null);
  const [suggestion, setSuggestion] = useState<ProgressionRecommendation | null>(null);
  const [prBurst, setPrBurst] = useState<PRBurstEvent | null>(null);
  const [editingSet, setEditingSet] = useState<SetRow | null>(null);
  const [activeProgram, setActiveProgramState] = useState<ActiveProgram | null>(null);
  const [showSwap, setShowSwap] = useState(false);

  // Read the live program context (week label + load multiplier) when a
  // workout opens, so live mode can banner it and scale loads.
  useEffect(() => {
    setActiveProgramState(lift.openWorkout ? getActiveProgram() : null);
  }, [lift.openWorkout?.id]);

  const activeStep = lift.openWorkoutSteps[activeStepIndex] ?? null;
  const exercise = useMemo(
    () => (activeStep ? lift.exercises.find((e) => e.id === activeStep.exercise_id) : null),
    [activeStep, lift.exercises],
  );
  const variant = useMemo(
    () =>
      activeStep?.variant_id
        ? lift.variants.find((v) => v.id === activeStep.variant_id)
        : null,
    [activeStep, lift.variants],
  );
  const stepSets = useMemo(
    () => lift.openWorkoutSets.filter((s) => s.step_id === activeStep?.id) ?? [],
    [lift.openWorkoutSets, activeStep],
  );

  const inventory = lift.inventories[0] ?? null;
  const platesParsed = useMemo<readonly number[]>(() => {
    try {
      return inventory ? (JSON.parse(inventory.plates_json) as number[]) : [];
    } catch {
      return [];
    }
  }, [inventory]);

  // Acquire a wake-lock while a workout is open. Release on unmount or
  // workout completion.
  useEffect(() => {
    if (!lift.openWorkout) return undefined;
    const lock = createWakeLock();
    void lock.acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void lock.acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      void lock.release();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lift.openWorkout?.id]);

  // Seed the SetCard defaults from the previous working set when the
  // active step changes.
  useEffect(() => {
    let cancelled = false;
    if (!exercise) {
      setDefaults(null);
      return;
    }
    (async () => {
      const targetReps = activeStep?.target_reps ?? 5;
      const targetSets = activeStep?.target_sets ?? 3;
      const increment = (exercise.default_unit as Unit) === 'lb' ? 5 : 2.5;

      const [last, lastSession] = await Promise.all([
        lastWorkingSetForExercise(lift.db, exercise.id),
        lastSessionWorkingSets(lift.db, exercise.id),
      ]);
      if (cancelled) return;

      // Progression suggestion from the last completed session.
      let rec: ProgressionRecommendation | null = null;
      if (lastSession) {
        const daysSinceLast = Math.max(
          0,
          Math.floor((Date.now() - Date.parse(lastSession.startedAt)) / 86_400_000),
        );
        rec = recommendProgression({
          targetReps,
          targetSets,
          increment,
          lastSessionSets: lastSession.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          daysSinceLast,
        });
      }
      setSuggestion(rec);

      if (!last) {
        // No history: seed from the suggestion if we somehow have one, else blank.
        setDefaults({ weight: rec?.nextWeight ?? 0, reps: targetReps, ref: null });
        return;
      }
      const daysAgo = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(last.completed_at)) / 86_400_000),
      );
      // Pre-fill with the coached next weight when it's a real suggestion.
      let seedWeight = rec && rec.nextWeight > 0 ? rec.nextWeight : last.weight;
      // A program deload week scales the seed down to the prescribed %.
      const prog = getActiveProgram();
      if (prog && prog.loadPct < 1 && seedWeight > 0) {
        seedWeight = applyWeekLoad(seedWeight, prog.loadPct, increment);
      }
      setDefaults({
        weight: seedWeight,
        reps: last.reps,
        ref: { weight: last.weight, reps: last.reps, daysAgo },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise?.id, lift.db]);

  if (!lift.openWorkout) {
    return <StartWorkoutScreen />;
  }

  if (!activeStep || !exercise) {
    return (
      <div className="lift-page lift-page--empty">
        <p className="lift-empty">No exercises in this workout.</p>
        <p className="lift-empty-sub">
          Add one from the Library tab, or finish this workout.
        </p>
        <button
          type="button"
          className="lift-finish-btn"
          onClick={handleFinishWorkout}
        >
          Finish workout
        </button>
      </div>
    );
  }

  const exerciseLabel = variant ? `${exercise.name} — ${variant.name}` : exercise.name;
  const targetSets = activeStep.target_sets ?? 0;

  async function handleSave(entry: {
    weight: number;
    reps: number;
    setType: SetType;
    rpe: number | null;
  }) {
    if (!lift.openWorkout || !activeStep) return;
    const unit: Unit = (exercise?.default_unit as Unit | undefined) ?? lift.defaultUnit;
    const set: SetRow = {
      id: newId('s'),
      step_id: activeStep.id,
      set_index: stepSets.length,
      weight: entry.weight,
      reps: entry.reps,
      unit,
      set_type: entry.setType,
      // RPE is optional; RIR is its complement (reps in reserve ≈ 10 − RPE).
      rpe: entry.rpe,
      rir: entry.rpe != null ? Math.max(0, 10 - entry.rpe) : null,
      bar_weight: inventory?.bar_weight ?? null,
      plate_inventory_id: inventory?.id ?? null,
      completed_at: new Date().toISOString(),
      source: 'manual',
    };
    await logSet(lift.db, set);

    // Cross-app: every set is broadcast for /today + /glance summaries.
    if (exercise) emitSetLogged(set, exercise.name);

    // PR detection — variant-scoped first, then lineage, then rep-range.
    // Detection uses the historical sets *excluding* the just-logged one;
    // we pass it explicitly via `detectPrCandidates` which filters by id.
    if (entry.setType === 'working' && exercise) {
      const variantId = exercise.variant_id ?? null;
      const lineageId = exercise.lineage_id ?? null;
      const [variantHist, lineageHist] = await Promise.all([
        variantId ? workingSetsForVariant(lift.db, variantId) : Promise.resolve([]),
        lineageId ? workingSetsForLineage(lift.db, lineageId) : Promise.resolve([]),
      ]);
      const candidates = detectPrCandidates({
        set,
        variantId,
        lineageId,
        variantHistory: variantHist,
        lineageHistory: lineageHist,
      });
      // Persist all PR rows; surface the first (variant > lineage > rep-range)
      // as the burst so the ceremony copy is the most personal.
      const ordered = ['variant', 'lineage', 'rep-range'] as const;
      const sorted = [...candidates].sort(
        (a, b) => ordered.indexOf(a.pr.kind) - ordered.indexOf(b.pr.kind),
      );
      for (const c of candidates) {
        await insertPr(lift.db, c.pr);
        emitPrBroken(c.pr, exercise.name);
      }
      const top = sorted[0];
      if (top) {
        const summary = top.previousBest
          ? `Beat ${top.previousBest.weight}${set.unit} × ${top.previousBest.reps}`
          : 'First time on the board';
        setPrBurst({
          id: top.pr.id,
          kind: top.pr.kind,
          weight: top.pr.weight,
          reps: top.pr.reps,
          unit: set.unit,
          summary,
        });
        try {
          // Distinct buzz pattern: short-long-short for "noticed."
          navigator.vibrate?.([40, 30, 80]);
        } catch {
          // ignore
        }
      }
    }

    await lift.refresh();
    setRestTrigger((t) => t + 1);
  }

  async function handleEditSave(patch: {
    weight: number;
    reps: number;
    setType: SetType;
    note: string | null;
    durationSeconds: number | null;
  }) {
    if (!editingSet) return;
    await updateSet(lift.db, editingSet.id, {
      weight: patch.weight,
      reps: patch.reps,
      set_type: patch.setType,
      note: patch.note,
      duration_seconds: patch.durationSeconds,
    });
    if (exercise) {
      await recomputePrsForExercise(
        lift.db,
        exercise.variant_id ?? null,
        exercise.lineage_id ?? null,
      );
    }
    setEditingSet(null);
    await lift.refresh();
  }

  async function handleEditDelete() {
    if (!editingSet) return;
    await deleteSet(lift.db, editingSet.id);
    if (exercise) {
      await recomputePrsForExercise(
        lift.db,
        exercise.variant_id ?? null,
        exercise.lineage_id ?? null,
      );
    }
    setEditingSet(null);
    await lift.refresh();
  }

  async function handleFinishWorkout() {
    if (!lift.openWorkout) return;
    const w = lift.openWorkout;
    const sets = await listSetsForWorkout(lift.db, w.id);
    await completeWorkout(lift.db, w.id);

    // Cross-app emission — workout-completed.
    const workingSets = sets.filter((s) => s.set_type === 'working');
    const tonnage = workingSets.reduce((acc, s) => acc + s.weight * s.reps, 0);
    const startedAt = w.started_at;
    const completedAt = new Date().toISOString();
    const durationMinutes = Math.max(
      1,
      Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 60_000),
    );
    emitWorkoutCompleted({
      exerciseCount: lift.openWorkoutSteps.length,
      setCount: workingSets.length,
      totalTonnage: Math.round(tonnage),
      durationMinutes,
      startedAt,
      completedAt,
    });

    // Strain check across all working sets — fires deload-recommended
    // when the 4-week ramp exceeds threshold.
    try {
      const allSets: SetRow[] = [];
      for (const recent of lift.recentWorkouts) {
        if (!recent.completed_at) continue;
        const rs = await listSetsForWorkout(lift.db, recent.id);
        for (const s of rs) if (s.set_type === 'working') allSets.push(s);
      }
      // Include the just-completed working sets too (they're not yet in
      // recentWorkouts state at this point).
      for (const s of workingSets) allSets.push(s);
      const strain = evaluateStrain({ workingSets: allSets });
      if (strain.recommendDeload) {
        emitDeloadRecommended(strain.reason);
      }

      // Training load — acute:chronic workload ratio across all history,
      // broadcast so recovery-aware apps can react.
      const load = computeTrainingLoad({ workingSets: allSets, sessionSets: workingSets });
      emitTrainingLoadUpdated(load);
    } catch {
      // strain + load checks are advisory only; never block the finish flow
    }

    // Advance the program pointer if this session came from one.
    const prog = getActiveProgram();
    if (prog) {
      incrementCompleted(prog.programId);
      setActiveProgram(null);
      setActiveProgramState(null);
    }

    await lift.refresh();
    lift.setTab('history');
  }

  async function handleSwap(toExerciseId: string, toVariantId: string | null) {
    if (!activeStep) return;
    await swapStepVariant(lift.db, activeStep.id, toExerciseId, toVariantId);
    setShowSwap(false);
    await lift.refresh();
  }

  async function toggleSupersetWithNext() {
    if (!activeStep) return;
    const next = lift.openWorkoutSteps[activeStepIndex + 1];
    if (!next) return;
    if (activeStep.superset_group && activeStep.superset_group === next.superset_group) {
      // Unlink both.
      await setStepSuperset(lift.db, activeStep.id, null);
      await setStepSuperset(lift.db, next.id, null);
    } else {
      const group = newId('ss');
      await setStepSuperset(lift.db, activeStep.id, group);
      await setStepSuperset(lift.db, next.id, group);
    }
    await lift.refresh();
  }

  // Sibling exercises in the same lineage = substitution alternatives.
  const alternatives = exercise?.lineage_id
    ? lift.exercises.filter((e) => e.lineage_id === exercise.lineage_id && e.id !== exercise.id)
    : [];

  // The paired step when the active exercise is in a superset.
  const supersetPartnerIndex =
    activeStep?.superset_group != null
      ? lift.openWorkoutSteps.findIndex(
          (s, i) => i !== activeStepIndex && s.superset_group === activeStep.superset_group,
        )
      : -1;
  const supersetPartner =
    supersetPartnerIndex >= 0 ? lift.openWorkoutSteps[supersetPartnerIndex] : null;
  const partnerExercise = supersetPartner
    ? lift.exercises.find((e) => e.id === supersetPartner.exercise_id)
    : null;

  const completedThisStep = stepSets.length;
  const allDone = targetSets > 0 && completedThisStep >= targetSets;

  return (
    <div className="lift-page">
      <header className="lift-workout-head">
        <p className="lift-workout-head__crumb">
          Step {activeStepIndex + 1} of {lift.openWorkoutSteps.length}
        </p>
        <p className="lift-workout-head__title">{exerciseLabel}</p>
      </header>

      {activeProgram ? (
        <p className={`lift-program-banner ${activeProgram.isDeload ? 'lift-program-banner--deload' : ''}`}>
          {activeProgram.programName} · {activeProgram.weekLabel}
          {activeProgram.loadPct < 1 ? ` · ${Math.round(activeProgram.loadPct * 100)}% loads` : ''}
        </p>
      ) : null}

      {partnerExercise ? (
        <div className="lift-superset-row">
          <span className="lift-superset-row__tag">superset</span>
          <button
            type="button"
            className="lift-secondary-btn lift-superset-row__switch"
            onClick={() => setActiveStepIndex(supersetPartnerIndex)}
          >
            ⇄ Switch to {partnerExercise.name}
          </button>
        </div>
      ) : null}

      <div className="lift-workout-actions">
        <button
          type="button"
          className="lift-text-btn"
          onClick={() => setShowSwap((s) => !s)}
          disabled={alternatives.length === 0}
          aria-expanded={showSwap}
        >
          {alternatives.length === 0 ? 'No substitutes' : showSwap ? '× Close' : '⇆ Substitute'}
        </button>
        {activeStepIndex < lift.openWorkoutSteps.length - 1 ? (
          <button type="button" className="lift-text-btn" onClick={toggleSupersetWithNext}>
            {activeStep.superset_group &&
            lift.openWorkoutSteps[activeStepIndex + 1]?.superset_group === activeStep.superset_group
              ? 'Unlink superset'
              : '⇄ Superset w/ next'}
          </button>
        ) : null}
      </div>

      {showSwap ? (
        <ul className="lift-swap-list" aria-label="Substitute exercise">
          {alternatives.map((alt) => (
            <li key={alt.id}>
              <button
                type="button"
                className="lift-swap-list__item"
                onClick={() => handleSwap(alt.id, alt.variant_id ?? null)}
              >
                {alt.name}
                {alt.equipment ? <span className="lift-swap-list__equip"> · {alt.equipment}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <PRBurst event={prBurst} onDismiss={() => setPrBurst(null)} />

      {exercise?.cues ? (
        <p className="lift-workout-cues">{exercise.cues}</p>
      ) : null}

      {suggestion && suggestion.action !== 'hold' && suggestion.nextWeight > 0 ? (
        <p className={`lift-suggestion lift-suggestion--${suggestion.action}`}>
          <span className="lift-suggestion__tag">{suggestion.action}</span>
          <span className="lift-suggestion__text">{suggestion.reason}</span>
        </p>
      ) : null}

      <SetCard
        exerciseName={exerciseLabel}
        setIndex={completedThisStep}
        totalSets={targetSets}
        unit={(exercise?.default_unit as Unit | undefined) ?? 'kg'}
        initialWeight={defaults?.weight ?? 0}
        initialReps={defaults?.reps ?? 5}
        setType="working"
        bodyweight={Boolean(exercise?.is_bodyweight)}
        onSave={handleSave}
        reference={defaults?.ref ?? null}
        plateContext={
          inventory && !exercise?.is_bodyweight
            ? { plates: platesParsed, bar: inventory.bar_weight }
            : null
        }
      />

      <RestTimer trigger={restTrigger} />

      <PreviousSetsList
        sets={stepSets}
        unit={(exercise?.default_unit as Unit | undefined) ?? lift.defaultUnit}
        onTap={(s) => setEditingSet(s)}
      />

      <EditSetSheet
        set={editingSet}
        exerciseName={exerciseLabel}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
        onClose={() => setEditingSet(null)}
      />

      <div className="lift-workout-foot">
        <button
          type="button"
          className="lift-secondary-btn"
          disabled={activeStepIndex === 0}
          onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
        >
          Previous
        </button>
        {activeStepIndex < lift.openWorkoutSteps.length - 1 ? (
          <button
            type="button"
            className="lift-primary-btn"
            onClick={() => setActiveStepIndex((i) => i + 1)}
          >
            Next exercise{allDone ? ' →' : ''}
          </button>
        ) : (
          <button
            type="button"
            className="lift-primary-btn"
            onClick={handleFinishWorkout}
          >
            Finish workout
          </button>
        )}
      </div>
    </div>
  );
}

function PreviousSetsList({
  sets,
  unit,
  onTap,
}: {
  sets: SetRow[];
  unit: Unit;
  onTap: (set: SetRow) => void;
}) {
  if (sets.length === 0) {
    return null;
  }
  return (
    <section className="lift-prev-sets" aria-label="Previous sets this workout">
      <p className="lift-prev-sets__head">This workout, this exercise · tap to edit</p>
      <ul className="lift-prev-sets__list">
        {sets.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className="lift-prev-sets__row lift-prev-sets__row--btn"
              onClick={() => onTap(s)}
            >
              <span className="lift-prev-sets__index">{i + 1}</span>
              <span className="lift-prev-sets__numerals">
                {s.weight}
                {unit} × {s.reps}
                {s.duration_seconds ? ` · ${s.duration_seconds}s` : ''}
              </span>
              {s.note ? <span className="lift-prev-sets__note">{s.note}</span> : null}
              {s.set_type !== 'working' ? (
                <span className="lift-prev-sets__type">{s.set_type}</span>
              ) : (
                <span className="lift-prev-sets__type" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartWorkoutScreen() {
  const lift = useLift();

  function announceStart(
    workoutId: string,
    source: string,
    templateId: string | null,
    exerciseCount: number,
  ) {
    emitWorkoutStarted({
      workoutId,
      source,
      templateId,
      exerciseCount,
      startedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="lift-page lift-page--start">
      <header className="lift-start__head">
        <h1 className="lift-start__h">Start a workout</h1>
        <p className="lift-start__sub">Pick a template or start blank.</p>
      </header>

      <ReadinessBanner />
      <StrainBanner />
      <WeekSummary />

      {lift.recentWorkouts.some((w) => w.completed_at) ? (
        <button
          type="button"
          className="lift-start__repeat"
          onClick={async () => {
            const result = await repeatLastWorkout(lift.db);
            if (result) {
              announceStart(result.workout.id, 'manual', result.workout.template_id ?? null, result.steps.length);
              await lift.refresh();
            }
          }}
        >
          ↻ Repeat last workout
        </button>
      ) : null}

      <ul className="lift-start__templates">
        {lift.templates.map((tpl) => (
          <li key={tpl.id} className="lift-start__template">
            <button
              type="button"
              className="lift-template-card"
              onClick={async () => {
                const { workout, steps } = await startWorkoutFromTemplate(lift.db, tpl.id);
                announceStart(workout.id, 'template', tpl.id, steps.length);
                await lift.refresh();
              }}
            >
              <span className="lift-template-card__name">{tpl.name}</span>
              {tpl.scheme ? (
                <span className="lift-template-card__scheme">{tpl.scheme}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="lift-start__blank"
        onClick={async () => {
          const w = await startBlankWorkout(lift.db);
          announceStart(w.id, 'manual', null, 0);
          await lift.refresh();
        }}
      >
        Start blank workout
      </button>
    </div>
  );
}
