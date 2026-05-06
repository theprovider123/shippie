/**
 * Query helpers for Field Kitchen. One small file per concern, all
 * async because the underlying engine is wa-sqlite + OPFS.
 *
 * Helpers stay free of UI knowledge. Anything that could be unit-tested
 * by a pure function lives in src/lib/* — these helpers are about
 * shape conversion and schema bootstrapping.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  BEANS_TABLE,
  BREWS_TABLE,
  DOUGH_SCHEDULES_TABLE,
  DRINKS_TABLE,
  MEALS_TABLE,
  beansSchema,
  brewsSchema,
  doughSchedulesSchema,
  drinksSchema,
  mealsSchema,
  type Bean,
  type Brew,
  type CookMethod,
  type DoughSchedule,
  type Drink,
  type DrinkKind,
  type Meal,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(BEANS_TABLE, beansSchema);
      await db.create(BREWS_TABLE, brewsSchema);
      await db.create(DOUGH_SCHEDULES_TABLE, doughSchedulesSchema);
      await db.create(MEALS_TABLE, mealsSchema);
      await db.create(DRINKS_TABLE, drinksSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Beans ----------

export async function listBeans(db: ShippieLocalDb): Promise<Bean[]> {
  await ensureSchema(db);
  return db.query<RowOf<Bean>>(BEANS_TABLE);
}

export async function createBean(
  db: ShippieLocalDb,
  input: Omit<Bean, 'id'> & { id?: string },
): Promise<Bean> {
  await ensureSchema(db);
  const bean: Bean = {
    id: input.id ?? newId(),
    name: input.name,
    roast_date: input.roast_date ?? null,
    origin: input.origin ?? null,
    notes: input.notes ?? null,
  };
  await db.insert(BEANS_TABLE, asRow(bean));
  return bean;
}

export async function deleteBean(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(BEANS_TABLE, id);
}

// ---------- Brews ----------

export async function listBrews(db: ShippieLocalDb, limit = 50): Promise<Brew[]> {
  await ensureSchema(db);
  return db.query<RowOf<Brew>>(BREWS_TABLE, { orderBy: { brewed_at: 'desc' }, limit });
}

export async function logBrew(
  db: ShippieLocalDb,
  input: Omit<Brew, 'id' | 'brewed_at'> & { id?: string; brewed_at?: string },
): Promise<Brew> {
  await ensureSchema(db);
  const brew: Brew = {
    id: input.id ?? newId(),
    ratio: input.ratio,
    water_g: input.water_g,
    coffee_g: input.coffee_g,
    bean_id: input.bean_id ?? null,
    bean_name: input.bean_name ?? null,
    brewed_at: input.brewed_at ?? new Date().toISOString(),
  };
  await db.insert(BREWS_TABLE, asRow(brew));
  return brew;
}

// ---------- Dough schedules ----------

export async function listSchedules(db: ShippieLocalDb, limit = 20): Promise<DoughSchedule[]> {
  await ensureSchema(db);
  return db.query<RowOf<DoughSchedule>>(DOUGH_SCHEDULES_TABLE, {
    orderBy: { started_at: 'desc' },
    limit,
  });
}

export async function saveSchedule(
  db: ShippieLocalDb,
  input: Omit<DoughSchedule, 'id'> & { id?: string },
): Promise<DoughSchedule> {
  await ensureSchema(db);
  const row: DoughSchedule = {
    id: input.id ?? newId(),
    hydration: input.hydration,
    salt_pct: input.salt_pct,
    leaven_pct: input.leaven_pct,
    flour_g: input.flour_g,
    cold_hours: input.cold_hours,
    started_at: input.started_at,
    ready_at: input.ready_at,
  };
  await db.insert(DOUGH_SCHEDULES_TABLE, asRow(row));
  return row;
}

// ---------- Meals ----------

export async function listMeals(db: ShippieLocalDb, limit = 30): Promise<Meal[]> {
  await ensureSchema(db);
  return db.query<RowOf<Meal>>(MEALS_TABLE, { orderBy: { started_at: 'desc' }, limit });
}

export async function startMeal(
  db: ShippieLocalDb,
  input: { method: CookMethod; internal_temp?: number | null; label?: string | null },
): Promise<Meal> {
  await ensureSchema(db);
  const meal: Meal = {
    id: newId(),
    method: input.method,
    internal_temp: input.internal_temp ?? null,
    started_at: new Date().toISOString(),
    ended_at: null,
    label: input.label ?? null,
  };
  await db.insert(MEALS_TABLE, asRow(meal));
  return meal;
}

export async function endMeal(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Meal>>(MEALS_TABLE, id, asRow({ ended_at: new Date().toISOString() }));
}

// ---------- Drinks ----------

export async function listDrinks(db: ShippieLocalDb, limit = 50): Promise<Drink[]> {
  await ensureSchema(db);
  return db.query<RowOf<Drink>>(DRINKS_TABLE, { orderBy: { logged_at: 'desc' }, limit });
}

export async function logDrink(db: ShippieLocalDb, kind: DrinkKind): Promise<Drink> {
  await ensureSchema(db);
  const drink: Drink = {
    id: newId(),
    kind,
    logged_at: new Date().toISOString(),
  };
  await db.insert(DRINKS_TABLE, asRow(drink));
  return drink;
}

export async function deleteDrink(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(DRINKS_TABLE, id);
}

// ---------- Today summaries (cross-mode totals strip) ----------

export interface TodayTotals {
  brews: number;
  bakes_started: number;
  meals_cooked: number;
  drinks: number;
}

export async function todayTotals(db: ShippieLocalDb, now = new Date()): Promise<TodayTotals> {
  await ensureSchema(db);
  const dayKey = isoDay(now);
  const [brews, schedules, meals, drinks] = await Promise.all([
    db.query<RowOf<Brew>>(BREWS_TABLE, { limit: 500 }),
    db.query<RowOf<DoughSchedule>>(DOUGH_SCHEDULES_TABLE, { limit: 200 }),
    db.query<RowOf<Meal>>(MEALS_TABLE, { limit: 200 }),
    db.query<RowOf<Drink>>(DRINKS_TABLE, { limit: 500 }),
  ]);
  return {
    brews: brews.filter((b) => isoDay(new Date(b.brewed_at)) === dayKey).length,
    bakes_started: schedules.filter((s) => isoDay(new Date(s.started_at)) === dayKey).length,
    meals_cooked: meals.filter(
      (m) => m.ended_at && isoDay(new Date(m.ended_at)) === dayKey,
    ).length,
    drinks: drinks.filter((d) => isoDay(new Date(d.logged_at)) === dayKey).length,
  };
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
