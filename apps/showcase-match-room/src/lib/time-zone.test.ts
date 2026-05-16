import { describe, expect, test } from 'bun:test';
import { formatKickoff, supportedTimeZone, timeZoneLabel } from './time-zone.ts';

describe('time zone formatting', () => {
  test('formats one kickoff for different local regions', () => {
    const kickoff = '2026-06-11T13:00:00-06:00';
    expect(formatKickoff(kickoff, 'Europe/London', 'en-GB')).toContain('20:00');
    expect(formatKickoff(kickoff, 'America/Mexico_City', 'en-GB')).toContain('13:00');
    expect(formatKickoff(kickoff, 'Asia/Tokyo', 'en-GB')).toContain('04:00');
  });

  test('guards unsupported browser time zones', () => {
    expect(supportedTimeZone('Europe/Paris')).toBe('Europe/Paris');
    expect(supportedTimeZone('Mars/Olympus')).toBe('Europe/London');
    expect(timeZoneLabel('America/New_York')).toContain('New York');
  });
});
