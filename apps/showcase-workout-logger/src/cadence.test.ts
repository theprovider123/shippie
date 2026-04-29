import { describe, expect, test } from 'bun:test';
import { dayName, inferCadence } from './cadence.ts';

function isoDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 12)).toISOString();
}

describe('inferCadence — workout-logger pattern detector', () => {
  test('returns null below the 7-session threshold', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      createdAt: isoDay(2026, 4, i + 1),
    }));
    expect(inferCadence(sessions)).toBeNull();
  });

  test('computes avg gap on weekday sessions', () => {
    const sessions = [1, 3, 5, 8, 10, 12, 15].map((d) => ({
      createdAt: isoDay(2026, 4, d),
    }));
    const out = inferCadence(sessions);
    expect(out).not.toBeNull();
    expect(out!.sampleSize).toBe(7);
    expect(out!.avgGapDays).toBeGreaterThan(1.9);
    expect(out!.avgGapDays).toBeLessThan(2.5);
  });

  test('detects a clear rest day when the user always skips Sunday', () => {
    // Mon (5), Tue (6), Thu (8), Fri (9), Mon (12), Tue (13), Thu (15) — never Sunday.
    const sessions = [
      isoDay(2026, 4, 6),
      isoDay(2026, 4, 7),
      isoDay(2026, 4, 9),
      isoDay(2026, 4, 10),
      isoDay(2026, 4, 13),
      isoDay(2026, 4, 14),
      isoDay(2026, 4, 16),
      isoDay(2026, 4, 17),
    ].map((createdAt) => ({ createdAt }));
    const out = inferCadence(sessions);
    expect(out?.restDay).toBe(0); // Sunday
  });

  test('returns no rest-day signal when sessions are evenly spread', () => {
    // One per weekday for two weeks.
    const sessions: { createdAt: string }[] = [];
    for (let week = 0; week < 2; week += 1) {
      for (let d = 0; d < 7; d += 1) {
        sessions.push({ createdAt: isoDay(2026, 4, 6 + week * 7 + d) });
      }
    }
    const out = inferCadence(sessions);
    expect(out?.restDay).toBeNull();
  });

  test('drops malformed timestamps without crashing', () => {
    const sessions = [
      { createdAt: 'not-a-date' },
      { createdAt: isoDay(2026, 4, 1) },
      { createdAt: isoDay(2026, 4, 2) },
      { createdAt: isoDay(2026, 4, 3) },
      { createdAt: isoDay(2026, 4, 4) },
      { createdAt: isoDay(2026, 4, 5) },
      { createdAt: isoDay(2026, 4, 6) },
      { createdAt: isoDay(2026, 4, 7) },
    ];
    const out = inferCadence(sessions);
    expect(out?.sampleSize).toBe(7);
  });
});

describe('dayName', () => {
  test('maps DOW to readable names', () => {
    expect(dayName(0)).toBe('Sunday');
    expect(dayName(6)).toBe('Saturday');
    expect(dayName(99)).toBe('');
  });
});
