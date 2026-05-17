import { describe, expect, test } from 'bun:test';
import { isOverdue, nextDueAfter, parseSchedule } from './med-schedule.ts';

describe('parseSchedule', () => {
  test('"as needed" / PRN', () => {
    expect(parseSchedule('as needed').kind).toBe('as-needed');
    expect(parseSchedule('PRN').kind).toBe('as-needed');
    expect(parseSchedule('When needed for pain').kind).toBe('as-needed');
  });

  test('"every N hours"', () => {
    const s = parseSchedule('every 6 hours');
    expect(s.kind).toBe('every-hours');
    if (s.kind === 'every-hours') expect(s.hours).toBe(6);
    const t = parseSchedule('Every 4 hrs after meals');
    expect(t.kind).toBe('every-hours');
    if (t.kind === 'every-hours') expect(t.hours).toBe(4);
  });

  test('"3x daily" / "3 times a day" / "three times a day"', () => {
    expect(parseSchedule('3x daily').kind).toBe('times-per-day');
    expect(parseSchedule('3 times a day').kind).toBe('times-per-day');
    const word = parseSchedule('three times a day');
    expect(word.kind).toBe('times-per-day');
    if (word.kind === 'times-per-day') expect(word.n).toBe(3);
  });

  test('"once daily" / "daily"', () => {
    const a = parseSchedule('once daily');
    expect(a.kind).toBe('times-per-day');
    if (a.kind === 'times-per-day') expect(a.n).toBe(1);
    const b = parseSchedule('Daily, with breakfast');
    expect(b.kind).toBe('times-per-day');
  });

  test('named slot phrases', () => {
    const m = parseSchedule('morning');
    expect(m.kind).toBe('fixed-slots');
    if (m.kind === 'fixed-slots') expect(m.slots).toEqual(['08:00']);

    const e = parseSchedule('Take morning + evening');
    expect(e.kind).toBe('fixed-slots');
    if (e.kind === 'fixed-slots') expect(e.slots).toEqual(['08:00', '19:00']);
  });

  test('unparseable nonsense', () => {
    expect(parseSchedule('').kind).toBe('unparseable');
    expect(parseSchedule('whenever, idk').kind).toBe('unparseable');
    expect(parseSchedule('🌚').kind).toBe('unparseable');
  });
});

describe('nextDueAfter', () => {
  test('every-hours uses last given dose', () => {
    const sched = parseSchedule('every 6 hours');
    const lastGiven = new Date('2026-05-05T08:00:00').getTime();
    const next = nextDueAfter(sched, lastGiven, new Date('2026-05-05T10:00:00'));
    expect(next).toBe(lastGiven + 6 * 3_600_000);
  });

  test('every-hours with no prior dose returns now', () => {
    const sched = parseSchedule('every 6 hours');
    const now = new Date('2026-05-05T10:00:00');
    const next = nextDueAfter(sched, null, now);
    expect(next).toBe(now.getTime());
  });

  test('fixed-slots picks the next slot today', () => {
    const sched = parseSchedule('morning + evening');
    const now = new Date('2026-05-05T12:00:00'); // between 08:00 and 19:00
    const next = nextDueAfter(sched, null, now);
    const expected = new Date('2026-05-05T19:00:00').getTime();
    expect(next).toBe(expected);
  });

  test('fixed-slots rolls into tomorrow when all today are past', () => {
    const sched = parseSchedule('morning');
    const now = new Date('2026-05-05T20:00:00');
    const next = nextDueAfter(sched, null, now);
    const expected = new Date('2026-05-06T08:00:00').getTime();
    expect(next).toBe(expected);
  });

  test('unparseable / as-needed return null', () => {
    expect(nextDueAfter(parseSchedule(''), null)).toBeNull();
    expect(nextDueAfter(parseSchedule('as needed'), null)).toBeNull();
  });

  test('times-per-day evenly spaces between 08:00 and 22:00', () => {
    const sched = parseSchedule('3x daily');
    const now = new Date('2026-05-05T07:00:00');
    const next = nextDueAfter(sched, null, now);
    const expected = new Date('2026-05-05T08:00:00').getTime();
    expect(next).toBe(expected);
  });
});

describe('isOverdue', () => {
  test('null nextDueAt is never overdue', () => {
    expect(isOverdue(null, Date.now())).toBe(false);
  });

  test('past nextDueAt is overdue', () => {
    expect(isOverdue(1000, 2000)).toBe(true);
  });

  test('future nextDueAt is not overdue', () => {
    expect(isOverdue(2000, 1000)).toBe(false);
  });
});
