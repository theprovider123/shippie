import { describe, expect, test } from 'bun:test';
import { formatGpsAge, isFreshGpsFix, isReportableGpsFix, LIVE_GPS_MAX_AGE_MS, REPORT_GPS_MAX_ACCURACY_M } from './gps';

describe('gps freshness', () => {
  test('accepts only recent GPS snapshots for live fan pings', () => {
    const now = Date.parse('2026-05-31T14:30:00+01:00');

    expect(isFreshGpsFix({ at: now - 5_000 }, now)).toBe(true);
    expect(isFreshGpsFix({ at: now - LIVE_GPS_MAX_AGE_MS }, now)).toBe(true);
    expect(isFreshGpsFix({ at: now - LIVE_GPS_MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(isFreshGpsFix({ at: now + 1 }, now)).toBe(false);
    expect(isFreshGpsFix(null, now)).toBe(false);
  });

  test('labels GPS age without implying stale fixes are live', () => {
    const now = Date.parse('2026-05-31T14:30:00+01:00');

    expect(formatGpsAge({ at: now - 1_000 }, now)).toBe('live now');
    expect(formatGpsAge({ at: now - 30_000 }, now)).toBe('30s old');
    expect(formatGpsAge({ at: now - 180_000 }, now)).toBe('3 min old');
    expect(formatGpsAge(null, now)).toBe('No live snapshot');
  });

  test('requires a tight enough live fix for bus and safety reports', () => {
    const now = Date.parse('2026-05-31T14:30:00+01:00');

    expect(isReportableGpsFix({ at: now - 10_000, accuracyM: 25 }, now)).toBe(true);
    expect(isReportableGpsFix({ at: now - 10_000, accuracyM: REPORT_GPS_MAX_ACCURACY_M }, now)).toBe(true);
    expect(isReportableGpsFix({ at: now - 10_000, accuracyM: REPORT_GPS_MAX_ACCURACY_M + 1 }, now)).toBe(false);
    expect(isReportableGpsFix({ at: now - LIVE_GPS_MAX_AGE_MS - 1, accuracyM: 25 }, now)).toBe(false);
  });
});
