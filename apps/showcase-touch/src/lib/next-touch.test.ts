import { describe, expect, test } from 'bun:test';
import { bandFor, computeNextTouchAt, daysUntil, labelFor, read } from './next-touch.ts';

const NOW = new Date('2026-05-05T12:00:00Z');

function isoDaysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe('next-touch · cadence math', () => {
  test('computeNextTouchAt adds cadenceDays to last_touch_at', () => {
    const last = '2026-04-01T00:00:00Z';
    const next = computeNextTouchAt(last, 30);
    expect(next).toBe('2026-05-01T00:00:00.000Z');
  });

  test('null last_touch_at returns null next_touch_at', () => {
    expect(computeNextTouchAt(null, 30)).toBeNull();
    expect(computeNextTouchAt(undefined, 30)).toBeNull();
  });

  test('falsy cadence falls back to default', () => {
    const last = '2026-04-01T00:00:00Z';
    const next = computeNextTouchAt(last, null);
    // 60-day default
    expect(next).toBe('2026-05-31T00:00:00.000Z');
  });

  test('garbage timestamp returns null', () => {
    expect(computeNextTouchAt('not-a-date', 30)).toBeNull();
  });
});

describe('next-touch · bands', () => {
  test('overdue / due-soon / fresh boundaries', () => {
    expect(bandFor(-30)).toBe('overdue');
    expect(bandFor(-7)).toBe('overdue');
    expect(bandFor(-6)).toBe('due-soon');
    expect(bandFor(0)).toBe('due-soon');
    expect(bandFor(7)).toBe('due-soon');
    expect(bandFor(8)).toBe('fresh');
    expect(bandFor(60)).toBe('fresh');
  });

  test('labelFor reads naturally', () => {
    expect(labelFor(0)).toBe('due today');
    expect(labelFor(1)).toBe('due tomorrow');
    expect(labelFor(-1)).toBe('overdue 1 day');
    expect(labelFor(-30)).toBe('overdue 30 days');
    expect(labelFor(7)).toBe('due in 7 days');
    expect(labelFor(Number.NEGATIVE_INFINITY)).toBe('no touches yet');
  });
});

describe('next-touch · read end-to-end', () => {
  test('inner-circle person touched 45 days ago is overdue', () => {
    // 45 - 30 = 15 days past due → overdue (>= 7 day window)
    const r = read(isoDaysAgo(45), 30, NOW);
    expect(r.band).toBe('overdue');
    expect(r.daysUntil).toBeLessThan(0);
  });

  test('warm contact touched 55 days ago at 60-day cadence is due-soon', () => {
    // due in 5 days → falls inside the +/- 7 day "due-soon" window
    const r = read(isoDaysAgo(55), 60, NOW);
    expect(r.band).toBe('due-soon');
    expect(r.daysUntil).toBeGreaterThanOrEqual(0);
  });

  test('person touched 10 days ago at 60-day cadence is fresh', () => {
    // due in 50 days → fresh
    const r = read(isoDaysAgo(10), 60, NOW);
    expect(r.band).toBe('fresh');
    expect(r.daysUntil).toBeGreaterThan(7);
  });

  test('person with no last touch is overdue and labeled "no touches yet"', () => {
    const r = read(null, 30, NOW);
    expect(r.band).toBe('overdue');
    expect(r.label).toBe('no touches yet');
    expect(r.nextTouchAt).toBeNull();
  });

  test('day comparison is calendar-day, not millisecond', () => {
    // Touched at midnight 30 days ago, cadence 30 → due_at exactly today.
    const last = new Date(Date.UTC(2026, 3, 5, 23, 30, 0)).toISOString();
    const r = read(last, 30, new Date('2026-05-05T01:00:00Z'));
    // Both fall in the due-soon window
    expect(r.band).toBe('due-soon');
  });
});
