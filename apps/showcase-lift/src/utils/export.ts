/**
 * Data export — your training history is yours to take.
 *
 * Lift's data passport (family `lift`, schema `lift.v1`) bundles every
 * table into one portable JSON document, and a flat CSV of sets for
 * spreadsheet folk. Pure builders: the caller injects `exportedAt` and
 * does the actual file download, so this stays testable and offline.
 *
 * This is the local-canonical promise made concrete — no server holds a
 * copy you can't get back.
 */
import type {
  Exercise,
  Lineage,
  PlateInventory,
  Pr,
  SetRow,
  Template,
  TemplateStep,
  Variant,
  Workout,
  WorkoutStep,
} from '../db/schema.ts';

export const PASSPORT_FAMILY = 'lift';
export const PASSPORT_SCHEMA = 'lift.v1';

export interface LiftPassport {
  family: typeof PASSPORT_FAMILY;
  schema: typeof PASSPORT_SCHEMA;
  exported_at: string;
  counts: Record<string, number>;
  data: {
    lineages: Lineage[];
    variants: Variant[];
    exercises: Exercise[];
    workouts: Workout[];
    steps: WorkoutStep[];
    sets: SetRow[];
    templates: Template[];
    template_steps: TemplateStep[];
    prs: Pr[];
    plate_inventories: PlateInventory[];
  };
}

export interface PassportInput {
  exportedAt: string;
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
}

export function buildPassport(input: PassportInput): LiftPassport {
  const data = {
    lineages: input.lineages,
    variants: input.variants,
    exercises: input.exercises,
    workouts: input.workouts,
    steps: input.steps,
    sets: input.sets,
    templates: input.templates,
    template_steps: input.templateSteps,
    prs: input.prs,
    plate_inventories: input.inventories,
  };
  const counts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(data)) counts[key] = rows.length;
  return {
    family: PASSPORT_FAMILY,
    schema: PASSPORT_SCHEMA,
    exported_at: input.exportedAt,
    counts,
    data,
  };
}

const CSV_COLUMNS = [
  'set_id',
  'workout_id',
  'exercise',
  'completed_at',
  'set_type',
  'weight',
  'unit',
  'reps',
  'rpe',
  'rir',
] as const;

/**
 * Flatten sets to CSV. `exerciseNameForStep` resolves a step id to a
 * human exercise name; missing names fall back to the step id.
 */
export function buildSetsCsv(
  sets: readonly SetRow[],
  stepToWorkout: (stepId: string) => string,
  stepToExercise: (stepId: string) => string,
): string {
  const header = CSV_COLUMNS.join(',');
  const rows = sets.map((s) =>
    [
      s.id,
      stepToWorkout(s.step_id),
      stepToExercise(s.step_id),
      s.completed_at,
      s.set_type,
      s.weight,
      s.unit,
      s.reps,
      s.rpe ?? '',
      s.rir ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

function csvCell(value: string | number): string {
  const s = String(value);
  // Quote anything containing a comma, quote, or newline; double inner quotes.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
