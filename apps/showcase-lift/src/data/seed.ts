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
    const variant: Variant = {
      id: variantId(lineageName, variantName),
      lineage_id: lineageId(lineageName),
      name: variantName,
      equipment: null,
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
    };
    await insertExercise(db, exercise);
  }

  // Templates.
  for (const spec of BUILTIN_TEMPLATES) {
    await seedTemplate(db, spec);
  }

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
