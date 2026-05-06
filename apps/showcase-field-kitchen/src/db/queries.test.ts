import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  createBean,
  deleteBean,
  deleteDrink,
  endMeal,
  isoDay,
  listBeans,
  listBrews,
  listDrinks,
  listMeals,
  listSchedules,
  logBrew,
  logDrink,
  saveSchedule,
  startMeal,
  todayTotals,
} from './queries.ts';

describe('beans', () => {
  it('creates and lists', async () => {
    const db = new MemoryLocalDb();
    const a = await createBean(db, { name: 'Heart Roasters Stereo' });
    expect(a.id).toBeTruthy();
    const all = await listBeans(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Heart Roasters Stereo');
  });

  it('deletes one', async () => {
    const db = new MemoryLocalDb();
    const a = await createBean(db, { name: 'Cargo Onyx' });
    await deleteBean(db, a.id);
    expect(await listBeans(db)).toHaveLength(0);
  });
});

describe('brews', () => {
  it('logs a brew with derived fields', async () => {
    const db = new MemoryLocalDb();
    await logBrew(db, { ratio: 16, water_g: 240, coffee_g: 15, bean_name: 'Cargo Onyx' });
    const all = await listBrews(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.ratio).toBe(16);
    expect(all[0]!.brewed_at).toBeTruthy();
  });
});

describe('schedules', () => {
  it('saves and lists schedules', async () => {
    const db = new MemoryLocalDb();
    await saveSchedule(db, {
      hydration: 70,
      salt_pct: 2,
      leaven_pct: 20,
      flour_g: 1000,
      cold_hours: 12,
      started_at: new Date().toISOString(),
      ready_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    });
    expect(await listSchedules(db)).toHaveLength(1);
  });
});

describe('meals', () => {
  it('starts and ends a meal', async () => {
    const db = new MemoryLocalDb();
    const meal = await startMeal(db, { method: 'sous-vide', label: 'Steak' });
    expect(meal.ended_at).toBeNull();
    await endMeal(db, meal.id);
    const list = await listMeals(db);
    expect(list[0]!.ended_at).toBeTruthy();
  });
});

describe('drinks', () => {
  it('logs a drink', async () => {
    const db = new MemoryLocalDb();
    await logDrink(db, 'water');
    await logDrink(db, 'coffee');
    expect(await listDrinks(db)).toHaveLength(2);
  });

  it('deletes a drink', async () => {
    const db = new MemoryLocalDb();
    const d = await logDrink(db, 'tea');
    await deleteDrink(db, d.id);
    expect(await listDrinks(db)).toHaveLength(0);
  });
});

describe('todayTotals', () => {
  it('sums today across all four modes', async () => {
    const db = new MemoryLocalDb();
    const now = new Date();
    await logBrew(db, { ratio: 16, water_g: 240, coffee_g: 15 });
    await saveSchedule(db, {
      hydration: 70,
      salt_pct: 2,
      leaven_pct: 20,
      flour_g: 1000,
      cold_hours: 12,
      started_at: now.toISOString(),
      ready_at: new Date(now.getTime() + 12 * 3600_000).toISOString(),
    });
    const meal = await startMeal(db, { method: 'pan', label: 'Eggs' });
    await endMeal(db, meal.id);
    await logDrink(db, 'water');
    await logDrink(db, 'coffee');

    const totals = await todayTotals(db, now);
    expect(totals.brews).toBe(1);
    expect(totals.bakes_started).toBe(1);
    expect(totals.meals_cooked).toBe(1);
    expect(totals.drinks).toBe(2);
  });

  it('ignores yesterday', async () => {
    const db = new MemoryLocalDb();
    const yesterday = new Date(Date.now() - 26 * 3600_000);
    await logBrew(db, {
      ratio: 16,
      water_g: 240,
      coffee_g: 15,
      brewed_at: yesterday.toISOString(),
    });
    const totals = await todayTotals(db);
    expect(totals.brews).toBe(0);
  });
});

describe('isoDay', () => {
  it('returns YYYY-MM-DD', () => {
    expect(isoDay(new Date('2026-05-05T23:30:00Z'))).toBe('2026-05-05');
  });
});
