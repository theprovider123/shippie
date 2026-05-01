import { describe, expect, test } from 'bun:test';
import {
  MOOD_PALETTE,
  dayKey,
  pruneOld,
  setTodayMood,
  todayKey,
  type MoodEntry,
} from './db';

describe('mood-pulse db helpers', () => {
  test('MOOD_PALETTE has 5 entries scored 1-5 in order', () => {
    expect(MOOD_PALETTE.length).toBe(5);
    expect(MOOD_PALETTE.map((p) => p.score)).toEqual([1, 2, 3, 4, 5]);
    for (const p of MOOD_PALETTE) {
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  test('setTodayMood replaces a same-day entry rather than appending', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const existingToday: MoodEntry = {
      id: 'old',
      score: 2,
      note: 'rough',
      logged_at: new Date().toISOString(),
    };
    const old: MoodEntry = {
      id: 'older',
      score: 4,
      note: null,
      logged_at: yesterday,
    };
    const { next, entry } = setTodayMood([existingToday, old], 5, 'great');
    // The new entry replaces the old today-row but keeps yesterday's.
    const todays = next.filter((m) => dayKey(m.logged_at) === todayKey());
    expect(todays).toHaveLength(1);
    expect(todays[0]?.score).toBe(5);
    expect(todays[0]?.note).toBe('great');
    expect(entry.score).toBe(5);
    expect(next.some((m) => m.id === 'older')).toBe(true);
    expect(next.some((m) => m.id === 'old')).toBe(false);
  });

  test('setTodayMood trims whitespace + empty notes become null', () => {
    const { entry } = setTodayMood([], 3, '   ');
    expect(entry.note).toBeNull();
    const { entry: e2 } = setTodayMood([], 3, '  thoughtful  ');
    expect(e2.note).toBe('thoughtful');
  });

  test('pruneOld drops entries older than 90 days', () => {
    const recent: MoodEntry = {
      id: 'a',
      score: 4,
      note: null,
      logged_at: new Date().toISOString(),
    };
    const old: MoodEntry = {
      id: 'b',
      score: 3,
      note: null,
      logged_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const out = pruneOld([recent, old]);
    expect(out.map((m) => m.id)).toEqual(['a']);
  });
});
