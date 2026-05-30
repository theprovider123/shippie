/**
 * Query helpers around `shippie.local.db` for Lift.
 *
 * Phase 1 surface — enough to start a workout, log sets, browse history,
 * use a template. PR detection lives in Phase 2.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';

import {
  EXERCISES_TABLE,
  LINEAGES_TABLE,
  PRS_TABLE,
  PLATE_INVENTORIES_TABLE,
  SETS_TABLE,
  STEPS_TABLE,
  TEMPLATES_TABLE,
  TEMPLATE_STEPS_TABLE,
  VARIANTS_TABLE,
  WORKOUTS_TABLE,
  PROGRAMS_TABLE,
  PROGRAM_WEEKS_TABLE,
  PROGRAM_SESSIONS_TABLE,
  exercisesSchema,
  lineagesSchema,
  plateInventoriesSchema,
  prsSchema,
  setsSchema,
  stepsSchema,
  templateStepsSchema,
  templatesSchema,
  variantsSchema,
  workoutsSchema,
  programsSchema,
  programWeeksSchema,
  programSessionsSchema,
  type Exercise,
  type Lineage,
  type PlateInventory,
  type Pr,
  type Program,
  type ProgramSession,
  type ProgramWeek,
  type SetRow,
  type Template,
  type TemplateStep,
  type Variant,
  type Workout,
  type WorkoutStep,
} from './schema.ts';
import { newId } from '../utils/ids.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(LINEAGES_TABLE, lineagesSchema);
      await db.create(VARIANTS_TABLE, variantsSchema);
      await db.create(EXERCISES_TABLE, exercisesSchema);
      await db.create(WORKOUTS_TABLE, workoutsSchema);
      await db.create(STEPS_TABLE, stepsSchema);
      await db.create(SETS_TABLE, setsSchema);
      await db.create(TEMPLATES_TABLE, templatesSchema);
      await db.create(TEMPLATE_STEPS_TABLE, templateStepsSchema);
      await db.create(PRS_TABLE, prsSchema);
      await db.create(PLATE_INVENTORIES_TABLE, plateInventoriesSchema);
      await db.create(PROGRAMS_TABLE, programsSchema);
      await db.create(PROGRAM_WEEKS_TABLE, programWeeksSchema);
      await db.create(PROGRAM_SESSIONS_TABLE, programSessionsSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

// ── Exercises / lineages / variants ─────────────────────────────────────

export async function listExercises(db: ShippieLocalDb): Promise<Exercise[]> {
  return db.query<Exercise & LocalDbRecord>(EXERCISES_TABLE, { orderBy: { name: 'asc' } });
}

export async function listLineages(db: ShippieLocalDb): Promise<Lineage[]> {
  return db.query<Lineage & LocalDbRecord>(LINEAGES_TABLE, { orderBy: { name: 'asc' } });
}

export async function listVariants(db: ShippieLocalDb): Promise<Variant[]> {
  return db.query<Variant & LocalDbRecord>(VARIANTS_TABLE);
}

export async function insertExercise(db: ShippieLocalDb, exercise: Exercise): Promise<void> {
  await db.insert(EXERCISES_TABLE, asRow(exercise));
}

export async function insertLineage(db: ShippieLocalDb, lineage: Lineage): Promise<void> {
  await db.insert(LINEAGES_TABLE, asRow(lineage));
}

export async function insertVariant(db: ShippieLocalDb, variant: Variant): Promise<void> {
  await db.insert(VARIANTS_TABLE, asRow(variant));
}

/**
 * Create a user-defined exercise with its own lineage + variant so PR
 * scoping and progression work exactly like the builtin lifts. Returns
 * the new exercise id.
 */
export async function insertCustomExercise(
  db: ShippieLocalDb,
  input: {
    name: string;
    muscleGroup: Exercise['muscle_group'];
    unit: Exercise['default_unit'];
    equipment?: string | null;
    cues?: string | null;
    isBodyweight?: boolean;
  },
): Promise<string> {
  const lineage: Lineage = { id: newId('ln'), name: input.name };
  await insertLineage(db, lineage);
  const variant: Variant = {
    id: newId('va'),
    lineage_id: lineage.id,
    name: input.equipment ?? 'Custom',
    equipment: input.equipment ?? null,
  };
  await insertVariant(db, variant);
  const exercise: Exercise = {
    id: newId('ex'),
    name: input.name,
    muscle_group: input.muscleGroup,
    lineage_id: lineage.id,
    variant_id: variant.id,
    default_unit: input.unit,
    notes: null,
    cues: input.cues ?? null,
    equipment: input.equipment ?? null,
    is_bodyweight: input.isBodyweight ? 1 : 0,
    source: 'custom',
  };
  await insertExercise(db, exercise);
  return exercise.id;
}

/** Gather every row across all tables — backs the data-passport export. */
export async function gatherAllData(db: ShippieLocalDb): Promise<{
  lineages: Lineage[];
  variants: Variant[];
  exercises: Exercise[];
  workouts: Workout[];
  steps: WorkoutStep[];
  sets: SetRow[];
  templates: Template[];
  templateSteps: TemplateStep[];
  prs: Pr[];
  inventories: PlateInventory[];
}> {
  const [lineages, variants, exercises, workouts, steps, sets, templates, templateSteps, prs, inventories] =
    await Promise.all([
      db.query<Lineage & LocalDbRecord>(LINEAGES_TABLE),
      db.query<Variant & LocalDbRecord>(VARIANTS_TABLE),
      db.query<Exercise & LocalDbRecord>(EXERCISES_TABLE),
      db.query<Workout & LocalDbRecord>(WORKOUTS_TABLE),
      db.query<WorkoutStep & LocalDbRecord>(STEPS_TABLE),
      db.query<SetRow & LocalDbRecord>(SETS_TABLE),
      db.query<Template & LocalDbRecord>(TEMPLATES_TABLE),
      db.query<TemplateStep & LocalDbRecord>(TEMPLATE_STEPS_TABLE),
      db.query<Pr & LocalDbRecord>(PRS_TABLE),
      db.query<PlateInventory & LocalDbRecord>(PLATE_INVENTORIES_TABLE),
    ]);
  return { lineages, variants, exercises, workouts, steps, sets, templates, templateSteps, prs, inventories };
}

// ── Templates ───────────────────────────────────────────────────────────

export async function listTemplates(db: ShippieLocalDb): Promise<Template[]> {
  return db.query<Template & LocalDbRecord>(TEMPLATES_TABLE, { orderBy: { created_at: 'desc' } });
}

export async function getTemplateSteps(
  db: ShippieLocalDb,
  templateId: string,
): Promise<TemplateStep[]> {
  return db.query<TemplateStep & LocalDbRecord>(TEMPLATE_STEPS_TABLE, {
    where: { template_id: templateId },
    orderBy: { order_index: 'asc' },
  });
}

export async function insertTemplate(
  db: ShippieLocalDb,
  template: Template,
  steps: TemplateStep[],
): Promise<void> {
  await db.insert(TEMPLATES_TABLE, asRow(template));
  for (const step of steps) {
    await db.insert(TEMPLATE_STEPS_TABLE, asRow(step));
  }
}

// ── Workouts ────────────────────────────────────────────────────────────

export async function startBlankWorkout(db: ShippieLocalDb): Promise<Workout> {
  const workout: Workout = {
    id: newId('w'),
    started_at: new Date().toISOString(),
    completed_at: null,
    template_id: null,
    source: 'manual',
    notes: null,
  };
  await db.insert(WORKOUTS_TABLE, asRow(workout));
  return workout;
}

export async function startWorkoutFromTemplate(
  db: ShippieLocalDb,
  templateId: string,
): Promise<{ workout: Workout; steps: WorkoutStep[] }> {
  const tplSteps = await getTemplateSteps(db, templateId);
  const workout: Workout = {
    id: newId('w'),
    started_at: new Date().toISOString(),
    completed_at: null,
    template_id: templateId,
    source: 'template',
    notes: null,
  };
  await db.insert(WORKOUTS_TABLE, asRow(workout));
  const steps: WorkoutStep[] = tplSteps.map((s) => ({
    id: newId('ws'),
    workout_id: workout.id,
    exercise_id: s.exercise_id,
    variant_id: s.variant_id ?? null,
    order_index: s.order_index,
    template_step_id: s.id,
    target_sets: s.target_sets,
    target_reps: s.target_reps,
    superset_group: s.superset_group ?? null,
  }));
  for (const step of steps) await db.insert(STEPS_TABLE, asRow(step));
  return { workout, steps };
}

/** Swap a live step's exercise/variant — the substitution path. */
export async function swapStepVariant(
  db: ShippieLocalDb,
  stepId: string,
  exerciseId: string,
  variantId: string | null,
): Promise<void> {
  await db.update<WorkoutStep & LocalDbRecord>(STEPS_TABLE, stepId, {
    exercise_id: exerciseId,
    variant_id: variantId,
  });
}

/** Link a step into a superset group (steps sharing a group alternate). */
export async function setStepSuperset(
  db: ShippieLocalDb,
  stepId: string,
  group: string | null,
): Promise<void> {
  await db.update<WorkoutStep & LocalDbRecord>(STEPS_TABLE, stepId, { superset_group: group });
}

// ── Programs ────────────────────────────────────────────────────────────

export async function listPrograms(db: ShippieLocalDb): Promise<Program[]> {
  return db.query<Program & LocalDbRecord>(PROGRAMS_TABLE, { orderBy: { created_at: 'desc' } });
}

export async function getProgramWeeks(db: ShippieLocalDb, programId: string): Promise<ProgramWeek[]> {
  return db.query<ProgramWeek & LocalDbRecord>(PROGRAM_WEEKS_TABLE, {
    where: { program_id: programId },
    orderBy: { week_index: 'asc' },
  });
}

export async function getProgramSessions(
  db: ShippieLocalDb,
  programId: string,
): Promise<ProgramSession[]> {
  return db.query<ProgramSession & LocalDbRecord>(PROGRAM_SESSIONS_TABLE, {
    where: { program_id: programId },
    orderBy: { day_index: 'asc' },
  });
}

export async function insertProgram(
  db: ShippieLocalDb,
  program: Program,
  weeks: ProgramWeek[],
  sessions: ProgramSession[],
): Promise<void> {
  await db.insert(PROGRAMS_TABLE, asRow(program));
  for (const w of weeks) await db.insert(PROGRAM_WEEKS_TABLE, asRow(w));
  for (const s of sessions) await db.insert(PROGRAM_SESSIONS_TABLE, asRow(s));
}

/**
 * Repeat the most recent completed workout: clone its steps into a fresh
 * workout so the lifter can re-run yesterday's session with one tap.
 * Returns null when there's nothing to repeat.
 */
export async function repeatLastWorkout(
  db: ShippieLocalDb,
): Promise<{ workout: Workout; steps: WorkoutStep[] } | null> {
  const recents = await db.query<Workout & LocalDbRecord>(WORKOUTS_TABLE, {
    orderBy: { started_at: 'desc' },
    limit: 20,
  });
  const last = recents.find((w) => w.completed_at);
  if (!last) return null;
  const sourceSteps = await listWorkoutSteps(db, last.id);
  if (sourceSteps.length === 0) return null;

  const workout: Workout = {
    id: newId('w'),
    started_at: new Date().toISOString(),
    completed_at: null,
    template_id: last.template_id ?? null,
    source: 'manual',
    notes: null,
  };
  await db.insert(WORKOUTS_TABLE, asRow(workout));
  const steps: WorkoutStep[] = sourceSteps.map((s) => ({
    id: newId('ws'),
    workout_id: workout.id,
    exercise_id: s.exercise_id,
    variant_id: s.variant_id ?? null,
    order_index: s.order_index,
    template_step_id: s.template_step_id ?? null,
    target_sets: s.target_sets ?? null,
    target_reps: s.target_reps ?? null,
    superset_group: s.superset_group ?? null,
  }));
  for (const step of steps) await db.insert(STEPS_TABLE, asRow(step));
  return { workout, steps };
}

/**
 * Working sets from the most recent *completed* session that included a
 * given exercise, plus that session's date. Feeds the progression engine.
 */
export async function lastSessionWorkingSets(
  db: ShippieLocalDb,
  exerciseId: string,
): Promise<{ sets: SetRow[]; startedAt: string } | null> {
  const steps = await db.query<WorkoutStep & LocalDbRecord>(STEPS_TABLE, {
    where: { exercise_id: exerciseId },
  });
  if (steps.length === 0) return null;

  // Group steps by workout, resolve each workout's completion + start.
  const byWorkout = new Map<string, WorkoutStep[]>();
  for (const s of steps) {
    const list = byWorkout.get(s.workout_id) ?? [];
    list.push(s);
    byWorkout.set(s.workout_id, list);
  }
  let best: { sets: SetRow[]; startedAt: string } | null = null;
  for (const [workoutId, wSteps] of byWorkout) {
    const w = (
      await db.query<Workout & LocalDbRecord>(WORKOUTS_TABLE, { where: { id: workoutId } })
    )[0];
    if (!w || !w.completed_at) continue;
    const working: SetRow[] = [];
    for (const st of wSteps) {
      const ss = await db.query<SetRow & LocalDbRecord>(SETS_TABLE, {
        where: { step_id: st.id, set_type: 'working' },
      });
      working.push(...ss);
    }
    if (working.length === 0) continue;
    if (!best || w.started_at > best.startedAt) {
      best = { sets: working, startedAt: w.started_at };
    }
  }
  return best;
}

export async function getOpenWorkout(db: ShippieLocalDb): Promise<Workout | null> {
  const all = await db.query<Workout & LocalDbRecord>(WORKOUTS_TABLE, {
    where: { completed_at: null },
    orderBy: { started_at: 'desc' },
    limit: 1,
  });
  return all[0] ?? null;
}

export async function listWorkoutSteps(
  db: ShippieLocalDb,
  workoutId: string,
): Promise<WorkoutStep[]> {
  return db.query<WorkoutStep & LocalDbRecord>(STEPS_TABLE, {
    where: { workout_id: workoutId },
    orderBy: { order_index: 'asc' },
  });
}

export async function addStepToWorkout(
  db: ShippieLocalDb,
  workoutId: string,
  exerciseId: string,
  variantId: string | null,
): Promise<WorkoutStep> {
  const existing = await listWorkoutSteps(db, workoutId);
  const step: WorkoutStep = {
    id: newId('ws'),
    workout_id: workoutId,
    exercise_id: exerciseId,
    variant_id: variantId,
    order_index: existing.length,
    template_step_id: null,
  };
  await db.insert(STEPS_TABLE, asRow(step));
  return step;
}

export async function completeWorkout(db: ShippieLocalDb, workoutId: string): Promise<void> {
  await db.update<Workout & LocalDbRecord>(WORKOUTS_TABLE, workoutId, {
    completed_at: new Date().toISOString(),
  });
}

export async function listRecentWorkouts(
  db: ShippieLocalDb,
  limit = 30,
): Promise<Workout[]> {
  return db.query<Workout & LocalDbRecord>(WORKOUTS_TABLE, {
    orderBy: { started_at: 'desc' },
    limit,
  });
}

// ── Sets ────────────────────────────────────────────────────────────────

export async function listSetsForStep(db: ShippieLocalDb, stepId: string): Promise<SetRow[]> {
  return db.query<SetRow & LocalDbRecord>(SETS_TABLE, {
    where: { step_id: stepId },
    orderBy: { set_index: 'asc' },
  });
}

export async function listSetsForWorkout(
  db: ShippieLocalDb,
  workoutId: string,
): Promise<SetRow[]> {
  const steps = await listWorkoutSteps(db, workoutId);
  const all: SetRow[] = [];
  for (const step of steps) {
    const sets = await listSetsForStep(db, step.id);
    all.push(...sets);
  }
  return all;
}

export async function logSet(db: ShippieLocalDb, set: SetRow): Promise<void> {
  await db.insert(SETS_TABLE, asRow(set));
}

export async function updateSet(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<SetRow>,
): Promise<void> {
  await db.update<SetRow & LocalDbRecord>(SETS_TABLE, id, patch);
}

export async function deleteSet(db: ShippieLocalDb, id: string): Promise<void> {
  await db.delete(SETS_TABLE, id);
}

/** Most recent working set for an exercise, ignoring warmups. Used to seed defaults. */
export async function lastWorkingSetForExercise(
  db: ShippieLocalDb,
  exerciseId: string,
): Promise<SetRow | null> {
  const steps = await db.query<WorkoutStep & LocalDbRecord>(STEPS_TABLE, {
    where: { exercise_id: exerciseId },
  });
  if (steps.length === 0) return null;
  let best: SetRow | null = null;
  for (const step of steps) {
    const sets = await db.query<SetRow & LocalDbRecord>(SETS_TABLE, {
      where: { step_id: step.id, set_type: 'working' },
      orderBy: { completed_at: 'desc' },
      limit: 1,
    });
    const cand = sets[0];
    if (!cand) continue;
    if (!best || cand.completed_at > best.completed_at) best = cand;
  }
  return best;
}

// ── PRs ─────────────────────────────────────────────────────────────────

export async function listPrsForExercise(
  db: ShippieLocalDb,
  variantId: string | null,
  lineageId: string | null,
): Promise<Pr[]> {
  const out: Pr[] = [];
  if (variantId) {
    const vs = await db.query<Pr & LocalDbRecord>(PRS_TABLE, {
      where: { variant_id: variantId },
    });
    out.push(...vs);
  }
  if (lineageId) {
    const ls = await db.query<Pr & LocalDbRecord>(PRS_TABLE, {
      where: { lineage_id: lineageId },
    });
    out.push(...ls);
  }
  return out;
}

export async function insertPr(db: ShippieLocalDb, pr: Pr): Promise<void> {
  await db.insert(PRS_TABLE, asRow(pr));
}

/**
 * Delete every PR row whose set_id is in the given set. Useful after
 * editing or deleting a logged set — caller then re-detects PRs from
 * scratch over the now-current history.
 */
export async function deletePrsBySetIds(
  db: ShippieLocalDb,
  setIds: readonly string[],
): Promise<void> {
  if (setIds.length === 0) return;
  const idSet = new Set(setIds);
  const all = await db.query<Pr & LocalDbRecord>(PRS_TABLE);
  for (const pr of all) {
    if (idSet.has(pr.set_id)) {
      await db.delete(PRS_TABLE, pr.id);
    }
  }
}

/**
 * Delete every PR row associated with a given variant or its sibling
 * variants in the lineage. Used as the "scrap and rebuild" path after
 * an edit/delete: the caller then walks the affected exercise's
 * working sets through detectPrCandidates() and re-inserts.
 */
export async function deletePrsForVariantOrLineage(
  db: ShippieLocalDb,
  variantId: string | null,
  lineageId: string | null,
): Promise<void> {
  if (!variantId && !lineageId) return;
  const all = await db.query<Pr & LocalDbRecord>(PRS_TABLE);
  for (const pr of all) {
    const matchVariant = variantId && pr.variant_id === variantId;
    const matchLineage = lineageId && pr.lineage_id === lineageId;
    if (matchVariant || matchLineage) {
      await db.delete(PRS_TABLE, pr.id);
    }
  }
}

/** Working sets across history for a single variant. Walks steps + sets. */
export async function workingSetsForVariant(
  db: ShippieLocalDb,
  variantId: string,
): Promise<SetRow[]> {
  const steps = await db.query<WorkoutStep & LocalDbRecord>(STEPS_TABLE, {
    where: { variant_id: variantId },
  });
  const all: SetRow[] = [];
  for (const step of steps) {
    const sets = await db.query<SetRow & LocalDbRecord>(SETS_TABLE, {
      where: { step_id: step.id, set_type: 'working' },
    });
    all.push(...sets);
  }
  return all;
}

/** Working sets across history for a whole lineage (any variant of it). */
export async function workingSetsForLineage(
  db: ShippieLocalDb,
  lineageId: string,
): Promise<SetRow[]> {
  const variants = await db.query<{ id: string; lineage_id: string } & LocalDbRecord>(
    VARIANTS_TABLE,
    { where: { lineage_id: lineageId } },
  );
  const all: SetRow[] = [];
  for (const v of variants) {
    const variantSets = await workingSetsForVariant(db, v.id);
    all.push(...variantSets);
  }
  return all;
}

// ── Plate inventories ───────────────────────────────────────────────────

export async function listPlateInventories(db: ShippieLocalDb): Promise<PlateInventory[]> {
  return db.query<PlateInventory & LocalDbRecord>(PLATE_INVENTORIES_TABLE);
}

export async function insertPlateInventory(
  db: ShippieLocalDb,
  inv: PlateInventory,
): Promise<void> {
  await db.insert(PLATE_INVENTORIES_TABLE, asRow(inv));
}
