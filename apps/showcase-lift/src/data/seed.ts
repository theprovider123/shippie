/**
 * First-run seed: minimal exercise library + canonical 5×5 starter
 * templates + default plate inventory. Idempotent — checks for existing
 * rows before inserting.
 *
 * Two flat data tables drive everything:
 *   - RAW_EXERCISES: [exerciseName, lineageName, variantName, muscleGroup]
 *   - BUILTIN_TEMPLATES: { name, scheme, exercises: [{ lineage, sets, reps }] }
 *
 * IDs are derived from name slugs so adding an exercise / template is a
 * one-line change. Lineage IDs are deduped automatically.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  insertExercise,
  insertLineage,
  insertPlateInventory,
  insertProgram,
  insertTemplate,
  insertVariant,
  listExercises,
  listPlateInventories,
} from '../db/queries.ts';
import { DEFAULT_BAR_KG, DEFAULT_PLATES_KG } from '../utils/plate-calc.ts';
import type {
  Exercise,
  Lineage,
  MuscleGroup,
  PlateInventory,
  Program,
  ProgramSession,
  ProgramWeek,
  Template,
  TemplateStep,
  Variant,
} from '../db/schema.ts';
import { newId } from '../utils/ids.ts';

// ── Exercise library ───────────────────────────────────────────────────

type RawExercise = readonly [
  exerciseName: string,
  lineageName: string,
  variantName: string,
  muscleGroup: MuscleGroup,
];

const RAW_EXERCISES: readonly RawExercise[] = [
  ['Barbell back squat',     'Squat',          'Barbell back', 'legs'],
  ['Barbell bench press',    'Bench press',    'Barbell',      'chest'],
  ['Dumbbell bench press',   'Bench press',    'Dumbbell',     'chest'],
  ['Conventional deadlift',  'Deadlift',       'Conventional', 'back'],
  ['Barbell row',            'Row',            'Barbell',      'back'],
  ['Overhead press',         'Overhead press', 'Barbell',      'shoulders'],
  ['Pull-up',                'Pull-up',        'Bodyweight',   'back'],
  ['Dip',                    'Dip',            'Bodyweight',   'chest'],
];

/** Short, imperative coaching cues, keyed by exercise name. */
const CUES: Record<string, string> = {
  'Barbell back squat': 'Brace hard, knees out, drive the floor away.',
  'Barbell bench press': 'Shoulder blades pinched, bar to mid-chest, leg drive.',
  'Dumbbell bench press': 'Control the stretch, press to lockout over the eyes.',
  'Conventional deadlift': 'Wedge in, lats tight, push — don’t yank.',
  'Barbell row': 'Hinge to ~45°, pull to the navel, no jerking.',
  'Overhead press': 'Squeeze glutes, bar over mid-foot at lockout.',
  'Pull-up': 'Start from a dead hang, drive elbows to the pockets.',
  Dip: 'Slight forward lean, descend until shoulders below elbows.',
};

/** Equipment label per variant name. */
const EQUIPMENT: Record<string, string> = {
  'Barbell back': 'barbell',
  Barbell: 'barbell',
  Dumbbell: 'dumbbell',
  Conventional: 'barbell',
  Bodyweight: 'bodyweight',
};

const BODYWEIGHT_LINEAGES = new Set(['Pull-up', 'Dip']);

// ── Builtin templates ──────────────────────────────────────────────────

interface TemplateSpec {
  readonly id: string;
  readonly name: string;
  readonly scheme: string;
  readonly exercises: readonly { lineage: string; sets: number; reps: number }[];
}

const BUILTIN_TEMPLATES: readonly TemplateSpec[] = [
  {
    id: 'tpl_5x5_a',
    name: '5×5 — Workout A',
    scheme: '5×5',
    exercises: [
      { lineage: 'Squat',       sets: 5, reps: 5 },
      { lineage: 'Bench press', sets: 5, reps: 5 },
      { lineage: 'Row',         sets: 5, reps: 5 },
    ],
  },
  {
    id: 'tpl_5x5_b',
    name: '5×5 — Workout B',
    scheme: '5×5',
    exercises: [
      { lineage: 'Squat',          sets: 5, reps: 5 },
      { lineage: 'Overhead press', sets: 5, reps: 5 },
      { lineage: 'Deadlift',       sets: 1, reps: 5 },
    ],
  },
];

// ── Slug helpers ───────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function lineageId(lineageName: string): string {
  return `ln_${slug(lineageName)}`;
}

function variantId(lineageName: string, variantName: string): string {
  return `va_${slug(lineageName)}_${slug(variantName)}`;
}

function exerciseId(lineageName: string, variantName: string): string {
  return `ex_${slug(lineageName)}_${slug(variantName)}`;
}

/** Pick the canonical (first-listed) variant for a lineage — used by templates. */
function canonicalVariantForLineage(lineageName: string): { exerciseId: string; variantId: string } {
  const row = RAW_EXERCISES.find((r) => r[1] === lineageName);
  if (!row) throw new Error(`No exercise registered for lineage '${lineageName}'`);
  return {
    exerciseId: exerciseId(row[1], row[2]),
    variantId: variantId(row[1], row[2]),
  };
}

// ── Seed runner ────────────────────────────────────────────────────────

export async function seedIfEmpty(db: ShippieLocalDb): Promise<void> {
  const existing = await listExercises(db);
  if (existing.length > 0) return;

  // Lineages — insert one row per distinct lineage name.
  const seenLineages = new Set<string>();
  for (const [, lineageName] of RAW_EXERCISES) {
    if (seenLineages.has(lineageName)) continue;
    seenLineages.add(lineageName);
    const lineage: Lineage = { id: lineageId(lineageName), name: lineageName };
    await insertLineage(db, lineage);
  }

  // Variants + exercises.
  for (const [exerciseName, lineageName, variantName, muscleGroup] of RAW_EXERCISES) {
    const equipment = EQUIPMENT[variantName] ?? null;
    const variant: Variant = {
      id: variantId(lineageName, variantName),
      lineage_id: lineageId(lineageName),
      name: variantName,
      equipment,
    };
    await insertVariant(db, variant);

    const exercise: Exercise = {
      id: exerciseId(lineageName, variantName),
      name: exerciseName,
      muscle_group: muscleGroup,
      lineage_id: lineageId(lineageName),
      variant_id: variantId(lineageName, variantName),
      default_unit: 'kg',
      notes: null,
      cues: CUES[exerciseName] ?? null,
      equipment,
      is_bodyweight: BODYWEIGHT_LINEAGES.has(lineageName) ? 1 : 0,
      source: 'builtin',
    };
    await insertExercise(db, exercise);
  }

  // Templates.
  for (const spec of BUILTIN_TEMPLATES) {
    await seedTemplate(db, spec);
  }

  // Builtin program: a 4-week 5×5 block, Day A / Day B alternating, with a
  // deload in week 4 (60% loads). Demonstrates blocks → weeks → deload.
  await seedStartingStrengthBlock(db);

  // Default plate inventory.
  const inventories = await listPlateInventories(db);
  if (inventories.length === 0) {
    const inv: PlateInventory = {
      id: 'pi_default_kg',
      name: 'Standard kg',
      plates_json: JSON.stringify(DEFAULT_PLATES_KG),
      bar_weight: DEFAULT_BAR_KG,
    };
    await insertPlateInventory(db, inv);
  }
}

async function seedStartingStrengthBlock(db: ShippieLocalDb): Promise<void> {
  const programId = 'prog_5x5_block';
  const now = new Date().toISOString();
  const program: Program = {
    id: programId,
    name: '5×5 Strength Block',
    weeks: 4,
    source: 'builtin',
    created_at: now,
    notes: 'Linear 5×5, two alternating sessions, deload in week 4.',
  };
  const weeks: ProgramWeek[] = [
    { id: newId('pw'), program_id: programId, week_index: 0, label: 'Build', load_pct: 1, is_deload: 0 },
    { id: newId('pw'), program_id: programId, week_index: 1, label: 'Build', load_pct: 1, is_deload: 0 },
    { id: newId('pw'), program_id: programId, week_index: 2, label: 'Peak', load_pct: 1, is_deload: 0 },
    { id: newId('pw'), program_id: programId, week_index: 3, label: 'Deload', load_pct: 0.6, is_deload: 1 },
  ];
  const sessions: ProgramSession[] = [
    { id: newId('ps'), program_id: programId, day_index: 0, label: 'Day A', template_id: 'tpl_5x5_a' },
    { id: newId('ps'), program_id: programId, day_index: 1, label: 'Day B', template_id: 'tpl_5x5_b' },
  ];
  await insertProgram(db, program, weeks, sessions);
}

async function seedTemplate(db: ShippieLocalDb, spec: TemplateSpec): Promise<void> {
  const tpl: Template = {
    id: spec.id,
    name: spec.name,
    scheme: spec.scheme,
    source: 'builtin',
    created_at: new Date().toISOString(),
  };
  const steps: TemplateStep[] = spec.exercises.map((row, index) => {
    const canonical = canonicalVariantForLineage(row.lineage);
    return {
      id: newId('ts'),
      template_id: spec.id,
      exercise_id: canonical.exerciseId,
      variant_id: canonical.variantId,
      order_index: index,
      target_sets: row.sets,
      target_reps: row.reps,
      target_load_pct: null,
    };
  });
  await insertTemplate(db, tpl, steps);
}
