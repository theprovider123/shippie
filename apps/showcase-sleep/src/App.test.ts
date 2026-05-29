import { describe, expect, test } from 'bun:test';
import {
  createSleepEntry,
  formatDuration,
  lastSevenNights,
  minutesBetween,
  summarizeSleep,
} from './sleep.ts';

describe('sleep helpers', () => {
  test('calculates sleep across midnight', () => {
    expect(minutesBetween('23:15', '06:45')).toBe(450);
    expect(formatDuration(450)).toBe('7h 30m');
  });

  test('creates a clamped entry from a draft', () => {
    const entry = createSleepEntry({
      sleptOn: '2026-05-29',
      bedTime: '22:00',
      wakeTime: '06:00',
      quality: 8,
      note: '  better  ',
    }, 42);
    expect(entry.durationMinutes).toBe(480);
    expect(entry.quality).toBe(5);
    expect(entry.note).toBe('better');
  });

  test('summarizes and keeps the last seven nights', () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      createSleepEntry({
        sleptOn: `2026-05-${String(20 + index).padStart(2, '0')}`,
        bedTime: '23:00',
        wakeTime: '07:00',
        quality: 3,
        note: '',
      }, index),
    );
    expect(lastSevenNights(rows)).toHaveLength(7);
    expect(summarizeSleep(rows).averageMinutes).toBe(480);
  });
});
