import { describe, expect, test } from 'bun:test';
import { SESSIONS, T } from './data.ts';
import { getCurrentSession, getUpcomingSessions, isRevealReady, resolveEventClock } from './schedule.ts';

describe('corporate event clock', () => {
  test('finds the current session from day and device minutes', () => {
    const current = getCurrentSession(SESSIONS, { day: 1, minutes: T(14, 16) });
    expect(current?.id).toBe('d1-breakout2');
  });

  test('returns upcoming sessions for the same day only', () => {
    const upcoming = getUpcomingSessions(SESSIONS, { day: 1, minutes: T(17, 46) });
    expect(upcoming.map((session) => session.id)).toEqual(['d1-coaches', 'd1-dinner']);
  });

  test('respects demo query overrides without a server clock', () => {
    const clock = resolveEventClock(new Date('2026-06-02T09:12:00'), '?day=2&time=13:31');
    expect(clock).toEqual({ day: 2, minutes: T(13, 31) });
    expect(isRevealReady(clock)).toBe(true);
  });
});
