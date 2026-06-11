import { describe, test, expect } from 'bun:test';
import { getWeekBounds, composeLetter, maybeGenerateLetter } from './letter';
import { emptyState, localDate } from './store';
import type { DayLog } from './store';

function makeDay(date: string, opts: Partial<DayLog> = {}): DayLog {
  return {
    date,
    things: {},
    journal: [],
    ...opts,
  };
}

// Fixture week: Sun May 31 – Sat Jun 6 2026
const FIXTURE_WEEK_ENDING = '2026-06-06';
function buildFixtureDays(): Record<string, DayLog> {
  return {
    '2026-06-01': makeDay('2026-06-01', {
      mood: 'heavy',
      things: {
        medication: { kind: 'medication', action: 'done', at: 1 },
        movement: { kind: 'movement', action: 'done', at: 2 },
      },
      journal: [{ id: 'j1', text: 'Everything felt like wading through mud today', at: 1 }],
    }),
    '2026-06-02': makeDay('2026-06-02', {
      mood: 'low',
      things: {
        medication: { kind: 'medication', action: 'done', at: 1 },
      },
    }),
    '2026-06-03': makeDay('2026-06-03', {
      mood: 'okay',
      things: {
        sleep: { kind: 'sleep', action: 'done', detail: '7.5h', at: 1 },
        medication: { kind: 'medication', action: 'done', at: 2 },
      },
    }),
    '2026-06-04': makeDay('2026-06-04', {
      mood: 'light',
      things: {
        movement: { kind: 'movement', action: 'done', at: 1 },
        sleep: { kind: 'sleep', action: 'done', detail: '8h', at: 2 },
      },
    }),
    '2026-06-05': makeDay('2026-06-05', {
      mood: 'light',
      things: {
        sleep: { kind: 'sleep', action: 'done', detail: '7h', at: 1 },
      },
    }),
  };
}

describe('letter — deterministic output', () => {
  test('produces a letter for fixture week with correct weekEnding', () => {
    const days = buildFixtureDays();
    const letter = composeLetter(days, FIXTURE_WEEK_ENDING);
    expect(letter.weekEnding).toBe(FIXTURE_WEEK_ENDING);
    expect(letter.id).toBe(`letter:${FIXTURE_WEEK_ENDING}`);
  });

  test('always closes with the fixed closing line', () => {
    const days = buildFixtureDays();
    const letter = composeLetter(days, FIXTURE_WEEK_ENDING);
    expect(letter.body).toContain(
      "Small things, most days — that's how a week like this gets built.",
    );
  });

  test('pills contain sleep average when sleep logged', () => {
    const days = buildFixtureDays();
    const letter = composeLetter(days, FIXTURE_WEEK_ENDING);
    const sleepPill = letter.pills.find((p) => p.includes('sleep'));
    expect(sleepPill).toBeDefined();
    expect(sleepPill).toMatch(/avg \d+\.\dh sleep/);
  });

  test('arc length equals 7 (full week)', () => {
    const days = buildFixtureDays();
    const letter = composeLetter(days, FIXTURE_WEEK_ENDING);
    expect(letter.arc).toHaveLength(7);
  });

  test('deterministic — same input produces same output', () => {
    const days = buildFixtureDays();
    const a = composeLetter(days, FIXTURE_WEEK_ENDING);
    const b = composeLetter(days, FIXTURE_WEEK_ENDING);
    expect(a.body).toBe(b.body);
    expect(a.pills).toEqual(b.pills);
  });
});

describe('letter — empty week', () => {
  test('empty days → quiet-week letter with no fabricated stats', () => {
    const letter = composeLetter({}, FIXTURE_WEEK_ENDING);
    expect(letter.body).toContain("The garden keeps growing either way.");
    expect(letter.body).toContain("Small things, most days");
    // Should not fabricate any stats
    expect(letter.pills).toHaveLength(0);
  });

  test('empty arc has 7 nulls', () => {
    const letter = composeLetter({}, FIXTURE_WEEK_ENDING);
    expect(letter.arc).toHaveLength(7);
    expect(letter.arc.every((m) => m === null)).toBe(true);
  });
});

describe('maybeGenerateLetter — no duplicate letters', () => {
  test('does not duplicate letters on repeat calls', () => {
    // Use a fixed week ending in the past so getWeekBounds can find it
    let state = emptyState();
    state = maybeGenerateLetter(state);
    const countAfterFirst = state.letters.length;

    state = maybeGenerateLetter(state);
    expect(state.letters).toHaveLength(countAfterFirst);
  });

  test('generates a letter when none exists for the week', () => {
    const state = emptyState();
    const newState = maybeGenerateLetter(state);
    expect(newState.letters.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getWeekBounds — Sunday to Saturday', () => {
  test('week bounds are Sunday → Saturday', () => {
    // June 11 2026 is a Thursday
    const { start, end } = getWeekBounds(new Date(2026, 5, 11));
    expect(start.getDay()).toBe(0); // Sunday
    expect(end.getDay()).toBe(6); // Saturday
  });

  test('Sunday of week is 6 days before Saturday', () => {
    const { start, end } = getWeekBounds(new Date(2026, 5, 11));
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(6);
  });

  test('returns completed week — end is before or equal to yesterday', () => {
    const today = new Date(2026, 5, 11); // Thursday June 11
    const { end } = getWeekBounds(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    expect(end.getTime()).toBeLessThanOrEqual(yesterday.getTime());
  });

  test('week ending date format', () => {
    const { end } = getWeekBounds(new Date(2026, 5, 11));
    const endStr = localDate(end);
    // Should be '2026-06-06' (previous Saturday)
    expect(endStr).toBe('2026-06-06');
  });
});
