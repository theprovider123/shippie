/**
 * Mise — local persistence (localStorage) and entry construction.
 *
 * Local data is canonical. We keep one JSON blob under a versioned key;
 * entries are tiny and pruned to a year. Nutrients are snapshotted onto
 * each entry at log time so editing a food later never rewrites history.
 */
import type { Food } from './foods-data';
import { SEED_FOODS, SEED_FOODS_BY_ID } from './foods-data';
import type { Entry, Goals, Meal, Mode, Nutrients, Slot, Units } from './types';
import { EMPTY_NUTRIENTS, nutrientsForServings, scaleNutrients, sumNutrients } from './nutrition';
import { targetsForMode } from './modes';
import { addDays, dayKey } from './dates';
import {
  emptyExternalContext,
  type ExternalContext,
  type ImportedMeal,
} from './intents';
import { DEFAULT_ENRICH, type EnrichConfig } from './enrich';

export const STORAGE_KEY = 'shippie.mise.v1';

export interface Persisted {
  version: 1;
  entries: Entry[];
  /** User-created foods (seeds live in foods-data.ts). */
  foods: Food[];
  meals: Meal[];
  goals: Goals;
  /** Favorited food ids (works for seed + custom). */
  favoriteFoodIds: string[];
  external: ExternalContext;
  /** Optional online enrichment config; off by default. */
  enrich: EnrichConfig;
}

export function defaultGoals(): Goals {
  return {
    mode: 'maintenance',
    units: 'metric',
    targets: targetsForMode('maintenance'),
    customized: false,
  };
}

function defaultPersisted(): Persisted {
  return {
    version: 1,
    entries: [],
    foods: [],
    meals: [],
    goals: defaultGoals(),
    favoriteFoodIds: [],
    external: emptyExternalContext(),
    enrich: { ...DEFAULT_ENRICH },
  };
}

// ── Load / save ──────────────────────────────────────────────────

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalise(JSON.parse(raw));
  } catch {
    /* corrupt / unavailable — fall through to defaults */
  }
  return defaultPersisted();
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — best-effort, local stays in memory */
  }
}

export function normalise(parsed: unknown): Persisted {
  const base = defaultPersisted();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Partial<Persisted>;
  const entries = Array.isArray(p.entries) ? p.entries.filter(isEntry) : [];
  const foods = Array.isArray(p.foods) ? p.foods.filter(isFood) : [];
  const meals = Array.isArray(p.meals) ? p.meals.filter(isMeal) : [];
  const favoriteFoodIds = Array.isArray(p.favoriteFoodIds)
    ? p.favoriteFoodIds.filter((x): x is string => typeof x === 'string')
    : [];
  const goals = normaliseGoals(p.goals);
  const external = { ...base.external, ...(p.external ?? {}) } as ExternalContext;
  const enrich: EnrichConfig =
    p.enrich && typeof p.enrich === 'object'
      ? { enabled: Boolean(p.enrich.enabled), ...(p.enrich.endpoint ? { endpoint: p.enrich.endpoint } : {}) }
      : { ...DEFAULT_ENRICH };
  return { version: 1, entries, foods, meals, goals, favoriteFoodIds, external, enrich };
}

function normaliseGoals(g: unknown): Goals {
  const d = defaultGoals();
  if (!g || typeof g !== 'object') return d;
  const gg = g as Partial<Goals>;
  const mode = (gg.mode ?? d.mode) as Mode;
  const units = (gg.units === 'imperial' ? 'imperial' : 'metric') as Units;
  const targets = { ...targetsForMode(mode, gg.bodyweightKg), ...(gg.targets ?? {}) };
  const out: Goals = { mode, units, targets, customized: Boolean(gg.customized) };
  if (typeof gg.bodyweightKg === 'number') out.bodyweightKg = gg.bodyweightKg;
  return out;
}

function isEntry(e: unknown): e is Entry {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.slot === 'string' &&
    typeof r.logged_at === 'string' &&
    !!r.nutrients &&
    typeof r.nutrients === 'object'
  );
}
function isFood(f: unknown): f is Food {
  if (!f || typeof f !== 'object') return false;
  const r = f as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && !!r.per100 && !!r.serving;
}
function isMeal(m: unknown): m is Meal {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.items);
}

// ── Ids & pruning ────────────────────────────────────────────────

export function newId(prefix = 'e'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop entries older than a year so the blob stays small. */
export function pruneEntries(entries: readonly Entry[], now: number = Date.now()): Entry[] {
  const cutoff = now - 365 * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.logged_at).getTime() >= cutoff);
}

// ── Food resolution ──────────────────────────────────────────────

/** Seed + custom foods, with the favorite flag applied from favoriteFoodIds. */
export function allFoods(custom: readonly Food[], favoriteIds: readonly string[]): Food[] {
  const fav = new Set(favoriteIds);
  const apply = (f: Food): Food => ({ ...f, favorite: fav.has(f.id) });
  return [...custom.map(apply), ...SEED_FOODS.map(apply)];
}

export function foodById(id: string | undefined, custom: readonly Food[]): Food | undefined {
  if (!id) return undefined;
  return SEED_FOODS_BY_ID.get(id) ?? custom.find((f) => f.id === id);
}

export function toggleFavorite(ids: readonly string[], foodId: string): string[] {
  return ids.includes(foodId) ? ids.filter((x) => x !== foodId) : [...ids, foodId];
}

// ── Entry construction ───────────────────────────────────────────

export function entryFromFood(
  food: Food,
  qty: number,
  slot: Slot,
  now: Date = new Date(),
  source: Entry['source'] = 'quick',
): Entry {
  const grams = food.serving.grams * qty;
  const entry: Entry = {
    id: newId(),
    foodId: food.id,
    name: food.name,
    slot,
    qty: Math.round(qty * 100) / 100,
    grams: Math.round(grams),
    nutrients: nutrientsForServings(food, qty),
    logged_at: now.toISOString(),
    source,
  };
  return entry;
}

/** Build an entry from grams (used by the portion picker & free-text). */
export function entryFromGrams(
  food: Food | null,
  name: string,
  grams: number,
  slot: Slot,
  now: Date = new Date(),
  source: Entry['source'] = 'free-text',
): Entry {
  const nutrients = food ? scaleNutrients(food.per100, grams) : { ...EMPTY_NUTRIENTS };
  const servingGrams = food?.serving.grams ?? 0;
  const entry: Entry = {
    id: newId(),
    name,
    slot,
    qty: servingGrams > 0 ? Math.round((grams / servingGrams) * 100) / 100 : 1,
    grams: Math.round(grams),
    nutrients,
    logged_at: now.toISOString(),
    source,
  };
  if (food) entry.foodId = food.id;
  return entry;
}

/** Expand a saved meal into individual (editable) entries. */
export function entriesFromMeal(
  meal: Meal,
  custom: readonly Food[],
  slot: Slot,
  now: Date = new Date(),
): Entry[] {
  const out: Entry[] = [];
  for (const item of meal.items) {
    const food = foodById(item.foodId, custom);
    if (!food) continue;
    out.push(entryFromFood(food, item.qty, slot, now, 'meal'));
  }
  return out;
}

/** Build an entry from an imported (cooked/planned) meal. */
export function entryFromImportedMeal(
  meal: ImportedMeal,
  slot: Slot,
  now: Date = new Date(),
): Entry {
  const n: Nutrients = { ...EMPTY_NUTRIENTS, ...(meal.nutrients ?? {}) };
  return {
    id: newId(),
    name: meal.name,
    slot,
    qty: 1,
    grams: 0,
    nutrients: n,
    logged_at: now.toISOString(),
    source: 'import',
    note: meal.source === 'cooked-meal' ? 'from Palate' : 'from your plan',
  };
}

// ── Copy yesterday ───────────────────────────────────────────────

/** Clone yesterday's entries into today, preserving time-of-day. */
export function copyYesterday(entries: readonly Entry[], now: Date = new Date()): Entry[] {
  const yKey = dayKey(addDays(now, -1));
  const yesterdays = entries.filter((e) => dayKey(e.logged_at) === yKey);
  return yesterdays.map((e) => {
    const old = new Date(e.logged_at);
    const cloned = new Date(now);
    cloned.setHours(old.getHours(), old.getMinutes(), 0, 0);
    return {
      ...e,
      id: newId(),
      logged_at: cloned.toISOString(),
      source: 'copy' as const,
    };
  });
}

// ── Quick-add candidates ─────────────────────────────────────────

export interface QuickItem {
  key: string;
  foodId?: string;
  name: string;
  qty: number;
  grams: number;
  nutrients: Nutrients;
  count: number;
}

function quickKey(e: Entry): string {
  return e.foodId ?? `name:${e.name.toLowerCase()}`;
}

/** Distinct recently-logged items, newest first. */
export function recentItems(entries: readonly Entry[], limit = 12): QuickItem[] {
  const seen = new Set<string>();
  const out: QuickItem[] = [];
  for (const e of [...entries].sort((a, b) => b.logged_at.localeCompare(a.logged_at))) {
    const key = quickKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    const item: QuickItem = {
      key,
      name: e.name,
      qty: e.qty,
      grams: e.grams,
      nutrients: e.nutrients,
      count: 1,
    };
    if (e.foodId) item.foodId = e.foodId;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Most-frequently logged items over the last `days` days. */
export function frequentItems(
  entries: readonly Entry[],
  limit = 12,
  days = 30,
  now: Date = new Date(),
): QuickItem[] {
  const cutoff = addDays(now, -days).getTime();
  const map = new Map<string, QuickItem>();
  for (const e of entries) {
    if (new Date(e.logged_at).getTime() < cutoff) continue;
    const key = quickKey(e);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const item: QuickItem = {
        key,
        name: e.name,
        qty: e.qty,
        grams: e.grams,
        nutrients: e.nutrients,
        count: 1,
      };
      if (e.foodId) item.foodId = e.foodId;
      map.set(key, item);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Re-log a quick item as a fresh entry. */
export function entryFromQuickItem(item: QuickItem, slot: Slot, now: Date = new Date()): Entry {
  const entry: Entry = {
    id: newId(),
    name: item.name,
    slot,
    qty: item.qty,
    grams: item.grams,
    nutrients: item.nutrients,
    logged_at: now.toISOString(),
    source: 'quick',
  };
  if (item.foodId) entry.foodId = item.foodId;
  return entry;
}

// ── Saved meal helpers ───────────────────────────────────────────

export function totalsForMeal(meal: Meal, custom: readonly Food[]): Nutrients {
  return sumNutrients(
    meal.items
      .map((it) => {
        const f = foodById(it.foodId, custom);
        return f ? nutrientsForServings(f, it.qty) : null;
      })
      .filter((n): n is Nutrients => n != null),
  );
}

// ── Export / import ──────────────────────────────────────────────

export function exportData(state: Persisted): string {
  return JSON.stringify({ app: 'mise', schema: 'mise.v1', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function parseImport(text: string): Persisted | null {
  try {
    const parsed = JSON.parse(text);
    const data = parsed?.data ?? parsed;
    return normalise(data);
  } catch {
    return null;
  }
}
