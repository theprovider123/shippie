/**
 * store.ts — v1 → v2 migration + export/import round trip + clearAll.
 *
 * Runs in bun:test with a tiny in-memory localStorage shim. The real
 * browser env adds quota errors etc., but the schema migration is the
 * load-bearing surface and we lock it in here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearAll, exportJson, importJson, load, save } from './store.ts';
import type { PersistedState } from './types.ts';

const STORAGE_KEY = 'shippie.habit-tracker.v2';
const LEGACY_KEY_V1 = 'shippie.habit-tracker.v1';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

declare const globalThis: { localStorage?: Storage };

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

afterEach(() => {
  delete globalThis.localStorage;
});

describe('store persistence + migration', () => {
  it('returns seed habits when storage is empty', () => {
    const state = load();
    expect(state.habits.length).toBeGreaterThan(0);
    expect(state.checks).toEqual([]);
    expect(state.checkins).toEqual([]);
    expect(state.reviews).toEqual([]);
  });

  it('migrates v1 legacy state forward into v2 shape', () => {
    globalThis.localStorage!.setItem(
      LEGACY_KEY_V1,
      JSON.stringify({
        habits: [
          { id: 'h1', name: 'Walk', intent: 'workout-completed', createdAt: '2026-01-01T00:00:00Z' },
        ],
        checks: [
          { id: 'c1', habitId: 'h1', checkedAt: '2026-01-02T08:00:00Z', source: 'cross-app' },
        ],
      }),
    );
    const state = load();
    expect(state.habits[0]!.cue?.intent).toBe('workout-completed');
    expect(state.habits[0]!.difficulty).toBe('medium');
    expect(state.habits[0]!.cadence).toBe('daily');
    expect(state.checks[0]!.status).toBe('done');
    // v2 fields default empty
    expect(state.checkins).toEqual([]);
    expect(state.reviews).toEqual([]);
  });

  it('round-trips through exportJson + importJson', () => {
    const original: PersistedState = {
      habits: [
        {
          id: 'h_walk',
          name: 'Walk',
          difficulty: 'easy',
          cadence: 'daily',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      checks: [
        {
          id: 'c1',
          habitId: 'h_walk',
          checkedAt: '2026-01-02T09:00:00Z',
          status: 'done',
          source: 'manual',
        },
      ],
      checkins: [
        { id: 'ci1', date: '2026-01-02', mood: 4, energy: 3, createdAt: '2026-01-02T08:00:00Z' },
      ],
      reviews: [
        { id: 'r1', isoWeek: '2026-W01', createdAt: '2026-01-04T20:00:00Z' },
      ],
      lastReviewedWeek: '2026-W01',
    };
    const raw = exportJson(original);
    const parsed = importJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.habits[0]!.name).toBe('Walk');
    expect(parsed!.checkins[0]!.mood).toBe(4);
    expect(parsed!.reviews[0]!.isoWeek).toBe('2026-W01');
  });

  it('importJson returns null for malformed input', () => {
    expect(importJson('{not json}')).toBeNull();
  });

  it('save then load round-trips full state', () => {
    const original: PersistedState = {
      habits: [
        {
          id: 'h_meditate',
          name: 'Meditate',
          difficulty: 'medium',
          cadence: 'daily',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      checks: [],
      checkins: [
        { id: 'ci1', date: '2026-01-01', stress: 2, createdAt: '2026-01-01T07:00:00Z' },
      ],
      reviews: [],
    };
    save(original);
    const loaded = load();
    expect(loaded.habits[0]!.id).toBe('h_meditate');
    expect(loaded.checkins[0]!.stress).toBe(2);
  });

  it('clearAll removes both v1 and v2 keys', () => {
    globalThis.localStorage!.setItem(STORAGE_KEY, '{}');
    globalThis.localStorage!.setItem(LEGACY_KEY_V1, '{}');
    clearAll();
    expect(globalThis.localStorage!.getItem(STORAGE_KEY)).toBeNull();
    expect(globalThis.localStorage!.getItem(LEGACY_KEY_V1)).toBeNull();
  });
});
