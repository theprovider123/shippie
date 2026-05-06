import { describe, expect, test } from 'bun:test';
import { advanceCursor, daysSince, isDue, nextUp, whoseTurn } from './rota.ts';

describe('rota — whoseTurn', () => {
  test('returns the cursor member when present', () => {
    const r = { members: ['a', 'b', 'c'], cursor: 1 };
    expect(whoseTurn(r, new Set(['a', 'b', 'c']))).toBe('b');
  });

  test('skips an absent member to find the next present one', () => {
    const r = { members: ['a', 'b', 'c'], cursor: 1 };
    expect(whoseTurn(r, new Set(['a', 'c']))).toBe('c');
  });

  test('wraps around when only the wrap-side member is present', () => {
    const r = { members: ['a', 'b', 'c'], cursor: 2 };
    expect(whoseTurn(r, new Set(['a']))).toBe('a');
  });

  test('returns null when the rota is empty', () => {
    expect(whoseTurn({ members: [], cursor: 0 }, new Set(['a']))).toBeNull();
  });

  test('returns null when no rota member is present', () => {
    expect(
      whoseTurn({ members: ['a', 'b'], cursor: 0 }, new Set(['c'])),
    ).toBeNull();
  });
});

describe('rota — nextUp', () => {
  test('returns the member after the cursor', () => {
    const r = { members: ['a', 'b', 'c'], cursor: 0 };
    expect(nextUp(r, new Set(['a', 'b', 'c']))).toBe('b');
  });

  test('wraps to the start', () => {
    const r = { members: ['a', 'b'], cursor: 1 };
    expect(nextUp(r, new Set(['a', 'b']))).toBe('a');
  });

  test('skips absent member', () => {
    const r = { members: ['a', 'b', 'c'], cursor: 0 };
    expect(nextUp(r, new Set(['a', 'c']))).toBe('c');
  });
});

describe('rota — advanceCursor', () => {
  test('advances by one mod length', () => {
    expect(advanceCursor({ members: ['a', 'b', 'c'], cursor: 0 })).toBe(1);
    expect(advanceCursor({ members: ['a', 'b', 'c'], cursor: 2 })).toBe(0);
  });

  test('returns 0 when rota is empty', () => {
    expect(advanceCursor({ members: [], cursor: 0 })).toBe(0);
  });
});

describe('rota — isDue + daysSince', () => {
  test('null last_done_at means due', () => {
    expect(isDue('weekly', null)).toBe(true);
  });

  test('within window: not due', () => {
    const now = 1_700_000_000_000;
    expect(isDue('weekly', now - 3 * 86_400_000, now)).toBe(false);
  });

  test('past window: due', () => {
    const now = 1_700_000_000_000;
    expect(isDue('weekly', now - 8 * 86_400_000, now)).toBe(true);
  });

  test('daysSince returns null for null', () => {
    expect(daysSince(null)).toBeNull();
  });

  test('daysSince returns floor of day difference', () => {
    const now = 1_700_000_000_000;
    expect(daysSince(now - 2.5 * 86_400_000, now)).toBe(2);
  });
});
