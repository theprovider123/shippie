import { describe, expect, test } from 'bun:test';
import { computeSleepDebt, hoursSlept } from './sleep-debt.ts';

describe('hoursSlept', () => {
  test('same-day window produces direct delta', () => {
    expect(hoursSlept('22:00', '06:00')).toBe(8);
  });

  test('crosses midnight cleanly', () => {
    expect(hoursSlept('23:30', '07:15')).toBe(7.8);
    expect(hoursSlept('00:30', '07:30')).toBe(7);
  });

  test('returns 0 on malformed input rather than NaN', () => {
    expect(hoursSlept('abc', '07:00')).toBe(0);
    expect(hoursSlept('22:00', '')).toBe(0);
  });
});

describe('computeSleepDebt', () => {
  test('zero nights → zero debt', () => {
    expect(computeSleepDebt([])).toEqual({
      totalDebtHours: 0,
      nightsCounted: 0,
      targetHours: 8,
    });
  });

  test('debt = sum(target - actual) over the window', () => {
    const nights = [
      { date: '2026-04-29', hours: 6 }, // -2
      { date: '2026-04-28', hours: 7 }, // -1
      { date: '2026-04-27', hours: 9 }, // +1
    ];
    const result = computeSleepDebt(nights);
    expect(result.totalDebtHours).toBeCloseTo(2 + 1 + -1, 5); // = 2
    expect(result.nightsCounted).toBe(3);
  });

  test('respects custom window — older nights drop out', () => {
    const nights = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      hours: 6,
    }));
    const result = computeSleepDebt(nights, 8, 7);
    // 7 nights × 2 hours short each = 14 hours of debt.
    expect(result.totalDebtHours).toBe(14);
    expect(result.nightsCounted).toBe(7);
  });

  test('honours custom target', () => {
    const nights = [{ date: '2026-04-29', hours: 6 }];
    expect(computeSleepDebt(nights, 7).totalDebtHours).toBe(1);
  });
});
