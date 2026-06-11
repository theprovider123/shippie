/**
 * Calendar export — the zero-infrastructure fixture reminder. Generates an
 * RFC 5545 VEVENT and hands it to the browser as a download; works offline
 * and needs no notification permission or push pipeline.
 */
import type { Fixture } from './types';

function icsStamp(iso: string): string {
  // 2026-08-16T14:00:00Z → 20260816T140000Z
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function fixtureToICS(fixture: Fixture, nowIso: string = new Date().toISOString()): string {
  const start = icsStamp(fixture.kickoffUtc);
  // Football is two hours of calendar, give or take stoppage time.
  const end = icsStamp(new Date(Date.parse(fixture.kickoffUtc) + 2 * 3_600_000).toISOString());
  const homeAway = fixture.venue === 'H' ? 'vs' : fixture.venue === 'A' ? 'away at' : 'v';
  const summary = `Arsenal ${homeAway} ${fixture.opponent} (${fixture.comp})`;
  const location = fixture.ground ?? (fixture.venue === 'H' ? 'Emirates Stadium' : '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shippie//The Cannon//EN',
    'BEGIN:VEVENT',
    `UID:cannon-${fixture.id}@shippie.app`,
    `DTSTAMP:${icsStamp(nowIso)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(summary)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    `DESCRIPTION:${escapeText(`Matchday. Open The Cannon: https://shippie.app/cannon?m=${fixture.id}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`Kick-off in one hour — Arsenal ${homeAway} ${fixture.opponent}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter((line): line is string => line !== null)
    .join('\r\n');
}

export function downloadICS(fixture: Fixture): void {
  const blob = new Blob([fixtureToICS(fixture)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arsenal-${fixture.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
