/**
 * Local-DB schema for Lift.
 *
 * Tables and types follow the plan's data model:
 * exercises (lineage_id + variant_id), workouts, workout_steps, sets,
 * templates, template_steps, prs, plate_inventories.
 *
 * Phase 5 tables (voice_memos, progress_photos) are declared as types but
 * not created at the schema level until that phase lands.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const EXERCISES_TABLE = 'exercises';
export const LINEAGES_TABLE = 'exercise_lineages';
export const VARIANTS_TABLE = 'exercise_variants';
export const WORKOUTS_TABLE = 'workouts';
export const STEPS_TABLE = 'workout_steps';
export const SETS_TABLE = 'sets';
export const TEMPLATES_TABLE = 'templates';
export const TEMPLATE_STEPS_TABLE = 'template_steps';
export const PRS_TABLE = 'prs';
export const PLATE_INVENTORIES_TABLE = 'plate_inventories';

export type Unit = 'kg' | 'lb';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure' | 'backoff';
export type WorkoutSource = 'manual' | 'template' | 'partner-sync' | 'import';
export type PrKind = 'variant' | 'lineage' | 'rep-range';
export type RepRange = '1-3' | '4-6' | '7-10' | '11-15' | '16+';
export type TemplateSource = 'builtin' | 'custom';
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'full-body';

export const exercisesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  muscle_group: 'text not null',
  lineage_id: 'text',
  variant_id: 'text',
  default_unit: 'text not null',
  notes: 'text',
};

export const lineagesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
};

export const variantsSchema: LocalDbSchema = {
  id: 'text primary key',
  lineage_id: 'text not null',
  name: 'text not null',
  equipment: 'text',
};

export const workoutsSchema: LocalDbSchema = {
  id: 'text primary key',
  started_at: 'text not null',
  completed_at: 'text',
  template_id: 'text',
  source: 'text not null',
  notes: 'text',
};

export const stepsSchema: LocalDbSchema = {
  id: 'text primary key',
  workout_id: 'text not null',
  exercise_id: 'text not null',
  variant_id: 'text',
  order_index: 'integer not null',
  template_step_id: 'text',
  target_sets: 'integer',
  target_reps: 'integer',
};

export const setsSchema: LocalDbSchema = {
  id: 'text primary key',
  step_id: 'text not null',
  set_index: 'integer not null',
  weight: 'real not null',
  reps: 'integer not null',
  unit: 'text not null',
  set_type: 'text not null',
  rpe: 'real',
  rir: 'integer',
  bar_weight: 'real',
  plate_inventory_id: 'text',
  completed_at: 'text not null',
  source: 'text not null',
};

export const templatesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  scheme: 'text',
  source: 'text not null',
  created_at: 'text not null',
};

export const templateStepsSchema: LocalDbSchema = {
  id: 'text primary key',
  template_id: 'text not null',
  exercise_id: 'text not null',
  variant_id: 'text',
  order_index: 'integer not null',
  target_sets: 'integer not null',
  target_reps: 'integer not null',
  target_load_pct: 'real',
};

export const prsSchema: LocalDbSchema = {
  id: 'text primary key',
  kind: 'text not null',
  variant_id: 'text',
  lineage_id: 'text',
  rep_range: 'text',
  weight: 'real not null',
  reps: 'integer not null',
  set_id: 'text not null',
  achieved_at: 'text not null',
};

export const plateInventoriesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  plates_json: 'text not null',
  bar_weight: 'real not null',
};

export interface Lineage {
  id: string;
  name: string;
}

export interface Variant {
  id: string;
  lineage_id: string;
  name: string;
  equipment?: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  lineage_id?: string | null;
  variant_id?: string | null;
  default_unit: Unit;
  notes?: string | null;
}

export interface Workout {
  id: string;
  started_at: string;
  completed_at?: string | null;
  template_id?: string | null;
  source: WorkoutSource;
  notes?: string | null;
}

export interface WorkoutStep {
  id: string;
  workout_id: string;
  exercise_id: string;
  variant_id?: string | null;
  order_index: number;
  template_step_id?: string | null;
  /** Copied from template_steps.target_sets at workout creation; undefined for blank workouts. */
  target_sets?: number | null;
  /** Copied from template_steps.target_reps at workout creation; undefined for blank workouts. */
  target_reps?: number | null;
}

export interface SetRow {
  id: string;
  step_id: string;
  set_index: number;
  weight: number;
  reps: number;
  unit: Unit;
  set_type: SetType;
  rpe?: number | null;
  rir?: number | null;
  bar_weight?: number | null;
  plate_inventory_id?: string | null;
  completed_at: string;
  source: WorkoutSource;
}

export interface Template {
  id: string;
  name: string;
  scheme?: string | null;
  source: TemplateSource;
  created_at: string;
}

export interface TemplateStep {
  id: string;
  template_id: string;
  exercise_id: string;
  variant_id?: string | null;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_load_pct?: number | null;
}

export interface Pr {
  id: string;
  kind: PrKind;
  variant_id?: string | null;
  lineage_id?: string | null;
  rep_range?: RepRange | null;
  weight: number;
  reps: number;
  set_id: string;
  achieved_at: string;
}

export interface PlateInventory {
  id: string;
  name: string;
  /** JSON-encoded number[] of plate weights, e.g. [25, 20, 15, 10, 5, 2.5, 1.25] */
  plates_json: string;
  bar_weight: number;
}
