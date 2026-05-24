import { describe, expect, test } from 'bun:test';
import {
  busTimingPresentation,
  isParadeDay,
  isParadeEve,
  isStartPromptWindow,
  startPromptKey,
} from './parade-time';

const startTime = '2026-05-31T14:00:00+01:00';

describe('parade time helpers', () => {
  test('identifies parade day and eve from the event start time', () => {
    expect(isParadeEve(startTime, Date.parse('2026-05-30T12:00:00+01:00'))).toBe(true);
    expect(isParadeDay(startTime, Date.parse('2026-05-31T09:00:00+01:00'))).toBe(true);
    expect(isParadeDay(startTime, Date.parse('2026-06-01T09:00:00+01:00'))).toBe(false);
  });

  test('only shows the start prompt in the final 30 minutes', () => {
    expect(isStartPromptWindow(startTime, Date.parse('2026-05-31T13:29:00+01:00'))).toBe(false);
    expect(isStartPromptWindow(startTime, Date.parse('2026-05-31T13:45:00+01:00'))).toBe(true);
    expect(isStartPromptWindow(startTime, Date.parse('2026-05-31T14:01:00+01:00'))).toBe(false);
  });

  test('bus timing collapses after departure and marks a broad current row', () => {
    expect(busTimingPresentation(startTime, 3, Date.parse('2026-05-31T13:20:00+01:00'))).toEqual({
      currentIndex: null,
      collapsed: false,
    });
    expect(busTimingPresentation(startTime, 3, Date.parse('2026-05-31T14:10:00+01:00'))).toEqual({
      currentIndex: 0,
      collapsed: false,
    });
    expect(busTimingPresentation(startTime, 3, Date.parse('2026-05-31T14:45:00+01:00'))).toEqual({
      currentIndex: 1,
      collapsed: true,
    });
  });

  test('start prompt storage key is event-specific', () => {
    expect(startPromptKey(startTime)).toContain(startTime);
  });
});
