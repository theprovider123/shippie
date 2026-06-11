import { describe, expect, it } from 'vitest';
import { fixtureToICS } from './ics';
import type { Fixture } from './types';

const fixture: Fixture = {
  id: 'pl-che-2026-08-30',
  kickoffUtc: '2026-08-30T15:30:00Z',
  comp: 'Premier League',
  opponent: 'Chelsea',
  opponentShort: 'CHE',
  venue: 'H',
  ground: 'Emirates Stadium',
  status: 'scheduled',
};

describe('fixtureToICS', () => {
  it('emits a valid VEVENT with UTC stamps, location, and a 1h alarm', () => {
    const ics = fixtureToICS(fixture, '2026-06-11T10:00:00.000Z');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:cannon-pl-che-2026-08-30@shippie.app');
    expect(ics).toContain('DTSTART:20260830T153000Z');
    expect(ics).toContain('DTEND:20260830T173000Z');
    expect(ics).toContain('SUMMARY:Arsenal vs Chelsea (Premier League)');
    expect(ics).toContain('LOCATION:Emirates Stadium');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain('https://shippie.app/cannon?m=pl-che-2026-08-30');
    // RFC 5545 line endings
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('says "away at" for away fixtures and escapes commas', () => {
    const away = fixtureToICS({ ...fixture, venue: 'A', ground: 'Stamford Bridge, London' });
    expect(away).toContain('SUMMARY:Arsenal away at Chelsea');
    expect(away).toContain('LOCATION:Stamford Bridge\\, London');
  });
});
