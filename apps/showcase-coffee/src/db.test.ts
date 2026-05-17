import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  load,
  modeForMethod,
  newId,
  RATIO_RANGE,
  round1,
  save,
  METHOD_DEFAULTS,
  METHOD_LABEL,
  MG_PER_GRAM,
  PROCESS_LABEL,
  todayIso,
} from './db.ts';

// Minimal in-memory localStorage stub so tests run under bun without a DOM.
function memStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});
afterEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});

describe('coffee db · constants', () => {
  test('METHOD_DEFAULTS covers all methods with sane ratios', () => {
    expect(METHOD_DEFAULTS.v60.ratio).toBeGreaterThan(12);
    expect(METHOD_DEFAULTS.v60.ratio).toBeLessThan(20);
    expect(METHOD_DEFAULTS.espresso.ratio).toBeLessThan(3);
    expect(METHOD_DEFAULTS.espresso.ratio).toBeGreaterThan(1);
  });

  test('METHOD_LABEL has a label per method', () => {
    for (const m of Object.keys(METHOD_DEFAULTS) as Array<keyof typeof METHOD_DEFAULTS>) {
      expect(METHOD_LABEL[m]).toBeTruthy();
    }
  });

  test('caffeine mg per gram is plausible (espresso > drip)', () => {
    expect(MG_PER_GRAM.espresso).toBeGreaterThan(MG_PER_GRAM.v60);
    expect(MG_PER_GRAM.aeropress).toBeGreaterThan(MG_PER_GRAM.chemex);
  });

  test('PROCESS_LABEL covers the four canonical processes', () => {
    expect(PROCESS_LABEL.washed).toBe('Washed');
    expect(PROCESS_LABEL.natural).toBe('Natural');
    expect(PROCESS_LABEL.honey).toBe('Honey');
    expect(PROCESS_LABEL.other).toBe('Other');
  });

  test('RATIO_RANGE keeps filter and espresso scopes separate', () => {
    expect(RATIO_RANGE.filter.min).toBeLessThan(RATIO_RANGE.filter.max);
    expect(RATIO_RANGE.espresso.min).toBeLessThan(RATIO_RANGE.espresso.max);
    expect(RATIO_RANGE.espresso.max).toBeLessThan(RATIO_RANGE.filter.min);
  });

  test('modeForMethod splits espresso vs filter', () => {
    expect(modeForMethod('espresso')).toBe('espresso');
    expect(modeForMethod('v60')).toBe('filter');
    expect(modeForMethod('chemex')).toBe('filter');
  });
});

describe('coffee db · helpers', () => {
  test('round1 keeps one decimal', () => {
    expect(round1(15.444)).toBe(15.4);
    expect(round1(15.456)).toBe(15.5);
    expect(round1(15)).toBe(15);
  });

  test('newId is unique-ish per call', () => {
    const a = newId('bean');
    const b = newId('bean');
    expect(a).not.toBe(b);
    expect(a.startsWith('bean_')).toBe(true);
  });

  test('todayIso returns YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('coffee db · load + save', () => {
  test('load on a fresh device returns seed beans', () => {
    const state = load();
    expect(state.beans.length).toBeGreaterThan(0);
    expect(state.brews).toEqual([]);
    expect(state.tasting_notes).toEqual([]);
  });

  test('save round-trips beans, brews, tasting notes', () => {
    save({
      beans: [
        {
          id: 'b1',
          name: 'Test bean',
          roast: 'medium',
          grind: '20',
          method: 'v60',
          ratio: 16,
          roast_date: '2026-04-30',
        },
      ],
      brews: [
        {
          id: 'br1',
          bean_id: 'b1',
          bean_name: 'Test bean',
          weight_g: 15,
          water_g: 240,
          ratio: 16,
          method: 'v60',
          brew_seconds: 180,
          taste_rating: 4,
          brewed_at: new Date().toISOString(),
        },
      ],
      tasting_notes: [
        {
          id: 'n1',
          bean_id: 'b1',
          kind: 'sweet',
          note: 'cocoa',
          created_at: new Date().toISOString(),
        },
      ],
    });
    const back = load();
    expect(back.beans).toHaveLength(1);
    expect(back.beans[0]?.roast_date).toBe('2026-04-30');
    expect(back.brews).toHaveLength(1);
    expect(back.tasting_notes).toHaveLength(1);
    expect(back.tasting_notes[0]?.kind).toBe('sweet');
  });

  test('load migrates from v1 storage', () => {
    globalThis.localStorage.setItem(
      'shippie.coffee.v1',
      JSON.stringify({
        beans: [
          {
            id: 'old-1',
            name: 'Legacy',
            roast: 'dark',
            grind: 'fine',
            method: 'espresso',
            ratio: 2,
          },
        ],
        brews: [],
      }),
    );
    const state = load();
    expect(state.beans.find((b) => b.id === 'old-1')).toBeTruthy();
    expect(state.tasting_notes).toEqual([]);
  });
});
