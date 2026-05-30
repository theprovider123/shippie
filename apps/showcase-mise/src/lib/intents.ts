/**
 * Mise — cross-app intent layer (pure).
 *
 * Outbound: builders that shape the rows Mise broadcasts (nutrition-logged,
 * meal-logged, protein-target-hit, hydration-logged, caffeine-logged,
 * macro-target-updated). Inbound: defensive mappers that fold unknown
 * rows from other apps (cooked-meal, meal-planned, pantry-inventory,
 * shopping-list, workout-completed, cycle-logged, body-metrics-logged,
 * mood-logged) into a bounded ExternalContext we can suggest from.
 *
 * Every inbound mapper assumes nothing about the provider's exact shape —
 * it reads the fields it recognises and ignores the rest, so a schema
 * change in another app degrades to "less context", never a crash.
 */
import type { Nutrients } from './foods-data';
import type { Entry, Goals, Slot } from './types';
import { roundNutrients } from './nutrition';

// ── Outbound payloads ────────────────────────────────────────────

export interface NutritionRow {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  slot: Slot;
  logged_at: string;
}

export function nutritionRowFromEntry(entry: Entry): NutritionRow {
  const n = roundNutrients(entry.nutrients);
  return {
    kcal: n.kcal,
    protein_g: n.protein_g,
    carb_g: n.carb_g,
    fat_g: n.fat_g,
    fiber_g: n.fiber_g,
    sodium_mg: n.sodium_mg,
    slot: entry.slot,
    logged_at: entry.logged_at,
  };
}

export interface MealLoggedRow {
  name: string;
  slot: Slot;
  kcal: number;
  protein_g: number;
  items: string[];
  logged_at: string;
}

export function mealLoggedRow(
  name: string,
  slot: Slot,
  entries: readonly Entry[],
  loggedAt: string,
): MealLoggedRow {
  let kcal = 0;
  let protein = 0;
  for (const e of entries) {
    kcal += e.nutrients.kcal;
    protein += e.nutrients.protein_g;
  }
  return {
    name,
    slot,
    kcal: Math.round(kcal),
    protein_g: Math.round(protein * 10) / 10,
    items: entries.map((e) => e.name),
    logged_at: loggedAt,
  };
}

export interface HydrationRow {
  ml: number;
  logged_at: string;
}
export function hydrationRow(ml: number, loggedAt: string): HydrationRow {
  return { ml: Math.round(ml), logged_at: loggedAt };
}

export interface CaffeineRow {
  mg: number;
  logged_at: string;
}
export function caffeineRow(mg: number, loggedAt: string): CaffeineRow {
  return { mg: Math.round(mg), logged_at: loggedAt };
}

export interface ProteinTargetRow {
  protein_g: number;
  target_g: number;
  date: string;
}
export function proteinTargetRow(proteinG: number, targetG: number, date: string): ProteinTargetRow {
  return { protein_g: Math.round(proteinG), target_g: Math.round(targetG), date };
}

export interface MacroTargetRow {
  mode: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  water_ml: number;
}
export function macroTargetRow(goals: Goals): MacroTargetRow {
  const t = goals.targets;
  return {
    mode: goals.mode,
    kcal: t.kcal,
    protein_g: t.protein_g,
    carb_g: t.carb_g,
    fat_g: t.fat_g,
    fiber_g: t.fiber_g,
    sodium_mg: t.sodium_mg,
    water_ml: t.water_ml,
  };
}

// ── Inbound context ──────────────────────────────────────────────

export interface ImportedMeal {
  name: string;
  slot?: Slot;
  nutrients?: Partial<Nutrients>;
  at: string;
  source: 'cooked-meal' | 'meal-planned';
}

export interface WorkoutEvent {
  kind?: string;
  kcal?: number;
  at: string;
}
export interface CycleEvent {
  phase?: string;
  day?: number;
  at: string;
}
export interface BodyMetricEvent {
  weightKg?: number;
  at: string;
}
export interface MoodEvent {
  mood?: string;
  score?: number;
  at: string;
}

export interface ExternalContext {
  cookedMeals: ImportedMeal[];
  plannedMeals: ImportedMeal[];
  pantry: string[];
  shopping: string[];
  workouts: WorkoutEvent[];
  cycle: CycleEvent[];
  bodyMetrics: BodyMetricEvent[];
  moods: MoodEvent[];
}

export function emptyExternalContext(): ExternalContext {
  return {
    cookedMeals: [],
    plannedMeals: [],
    pantry: [],
    shopping: [],
    workouts: [],
    cycle: [],
    bodyMetrics: [],
    moods: [],
  };
}

const CAP = 24;
const prepend = <T>(item: T, list: T[]): T[] => [item, ...list].slice(0, CAP);
const prependMany = <T>(items: T[], list: T[]): T[] => [...items, ...list].slice(0, CAP);

function rec(row: unknown): Record<string, unknown> {
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
}
function asNum(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function nowIso(): string {
  return new Date().toISOString();
}

function firstNum(r: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = asNum(r[k]);
    if (n != null) return n;
  }
  return undefined;
}
function firstStr(r: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = asStr(r[k]);
    if (s) return s;
  }
  return undefined;
}

/** Pull a (partial) nutrient profile out of an arbitrary provider row. */
export function parseNutrients(r: Record<string, unknown>): Partial<Nutrients> | undefined {
  const n: Partial<Nutrients> = {};
  const kcal = firstNum(r, ['kcal', 'calories', 'energy', 'cal']);
  const protein = firstNum(r, ['protein_g', 'protein']);
  const carb = firstNum(r, ['carb_g', 'carbs', 'carbohydrate', 'carbohydrates']);
  const fat = firstNum(r, ['fat_g', 'fat']);
  const fiber = firstNum(r, ['fiber_g', 'fiber', 'fibre']);
  const sodium = firstNum(r, ['sodium_mg', 'sodium']);
  if (kcal != null) n.kcal = kcal;
  if (protein != null) n.protein_g = protein;
  if (carb != null) n.carb_g = carb;
  if (fat != null) n.fat_g = fat;
  if (fiber != null) n.fiber_g = fiber;
  if (sodium != null) n.sodium_mg = sodium;
  return Object.keys(n).length > 0 ? n : undefined;
}

function parseMeal(row: unknown, source: ImportedMeal['source']): ImportedMeal | null {
  const r = rec(row);
  const name = firstStr(r, ['name', 'title', 'recipe', 'label', 'meal', 'dish']);
  if (!name) return null;
  const slot = firstStr(r, ['slot', 'meal_type', 'mealType']) as Slot | undefined;
  const meal: ImportedMeal = {
    name,
    at: firstStr(r, ['at', 'logged_at', 'cooked_at', 'cookedAt', 'date']) ?? nowIso(),
    source,
  };
  if (slot && ['breakfast', 'lunch', 'dinner', 'snack', 'drink'].includes(slot)) meal.slot = slot;
  const nut = parseNutrients(r);
  if (nut) meal.nutrients = nut;
  return meal;
}

export function mergeCookedMeals(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  const meals = rows.map((r) => parseMeal(r, 'cooked-meal')).filter((m): m is ImportedMeal => !!m);
  return meals.length ? { ...ctx, cookedMeals: prependMany(meals, ctx.cookedMeals) } : ctx;
}

export function mergePlannedMeals(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  const meals = rows.map((r) => parseMeal(r, 'meal-planned')).filter((m): m is ImportedMeal => !!m);
  return meals.length ? { ...ctx, plannedMeals: prependMany(meals, ctx.plannedMeals) } : ctx;
}

function parseNames(rows: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      const s = row.trim();
      if (s) out.push(s);
      continue;
    }
    const r = rec(row);
    const name = firstStr(r, ['name', 'item', 'title', 'label', 'ingredient']);
    if (name) out.push(name);
  }
  return out;
}

export function mergePantry(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  const names = parseNames(rows);
  if (!names.length) return ctx;
  const merged = [...names, ...ctx.pantry];
  return { ...ctx, pantry: Array.from(new Set(merged)).slice(0, CAP) };
}

export function mergeShopping(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  const names = parseNames(rows);
  if (!names.length) return ctx;
  const merged = [...names, ...ctx.shopping];
  return { ...ctx, shopping: Array.from(new Set(merged)).slice(0, CAP) };
}

export function mergeWorkouts(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  let next = ctx.workouts;
  for (const row of rows) {
    const r = rec(row);
    const ev: WorkoutEvent = { at: firstStr(r, ['at', 'logged_at', 'completed_at', 'date']) ?? nowIso() };
    const kind = firstStr(r, ['kind', 'type', 'name', 'activity']);
    const kcal = firstNum(r, ['kcal', 'calories', 'energy', 'burned']);
    if (kind) ev.kind = kind;
    if (kcal != null) ev.kcal = kcal;
    next = prepend(ev, next);
  }
  return next === ctx.workouts ? ctx : { ...ctx, workouts: next };
}

export function mergeCycle(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  let next = ctx.cycle;
  for (const row of rows) {
    const r = rec(row);
    const ev: CycleEvent = { at: firstStr(r, ['at', 'logged_at', 'date']) ?? nowIso() };
    const phase = firstStr(r, ['phase', 'cycle_phase', 'window']);
    const day = firstNum(r, ['day', 'cycle_day', 'cycleDay']);
    if (phase) ev.phase = phase;
    if (day != null) ev.day = day;
    next = prepend(ev, next);
  }
  return next === ctx.cycle ? ctx : { ...ctx, cycle: next };
}

export function mergeBodyMetrics(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  let next = ctx.bodyMetrics;
  for (const row of rows) {
    const r = rec(row);
    const ev: BodyMetricEvent = { at: firstStr(r, ['at', 'logged_at', 'date']) ?? nowIso() };
    const w = firstNum(r, ['weight_kg', 'weightKg', 'weight', 'kg']);
    if (w != null) ev.weightKg = w;
    next = prepend(ev, next);
  }
  return next === ctx.bodyMetrics ? ctx : { ...ctx, bodyMetrics: next };
}

export function mergeMoods(ctx: ExternalContext, rows: readonly unknown[]): ExternalContext {
  let next = ctx.moods;
  for (const row of rows) {
    const r = rec(row);
    const ev: MoodEvent = { at: firstStr(r, ['at', 'logged_at', 'date']) ?? nowIso() };
    const mood = firstStr(r, ['mood', 'feeling', 'label', 'emotion']);
    const score = firstNum(r, ['score', 'value', 'rating', 'energy']);
    if (mood) ev.mood = mood;
    if (score != null) ev.score = score;
    next = prepend(ev, next);
  }
  return next === ctx.moods ? ctx : { ...ctx, moods: next };
}

/** Most recent body-metric weight, if any. */
export function latestWeightKg(ctx: ExternalContext): number | undefined {
  for (const ev of ctx.bodyMetrics) if (ev.weightKg != null) return ev.weightKg;
  return undefined;
}
