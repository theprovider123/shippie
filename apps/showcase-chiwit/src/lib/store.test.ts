import { describe, test, expect, beforeEach } from 'bun:test';

// In-memory localStorage mock (Bun runtime has no DOM by default)
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
}

(globalThis as unknown as Record<string, unknown>).localStorage = new MemoryStorage();

import { emptyState, loadState, saveState, localDate, STORAGE_KEY, OLD_KEY } from './store';

describe('store round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('emptyState has version 1', () => {
    expect(emptyState().version).toBe(1);
  });

  test('round-trip: save and load', () => {
    const s = emptyState();
    s.days['2026-06-11'] = { date: '2026-06-11', things: {}, journal: [], mood: 'okay' };
    saveState(s);
    const loaded = loadState();
    expect(loaded.days['2026-06-11']?.mood).toBe('okay');
  });

  test('migration no-op when old key absent', () => {
    const s = loadState();
    expect(s.version).toBe(1);
    expect(Object.keys(s.days)).toHaveLength(0);
  });

  test('water import from old key', () => {
    // old state had hydration entries — should map to water count
    const oldState = {
      entries: [
        { id: 'e1', kind: 'hydration', date: '2026-06-11', value: 1, amount: 250, createdAt: Date.now() }
      ],
      checkins: []
    };
    localStorage.setItem(OLD_KEY, JSON.stringify(oldState));
    const s = loadState();
    // water import: 1 old hydration entry → count 1 water thing
    const today = Object.values(s.days)[0];
    expect(today?.things['water']?.count).toBeGreaterThanOrEqual(1);
  });

  test('localDate returns YYYY-MM-DD format', () => {
    const d = localDate(new Date(2026, 5, 11)); // June 11, 2026
    expect(d).toBe('2026-06-11');
  });
});
