import { describe, expect, test } from 'bun:test';
import { aggregate, type RawEvent } from './rollups.ts';

function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

describe('aggregate', () => {
  test('empty events array returns empty array', () => {
    const day = utcDay(2026, 4, 21);
    expect(aggregate([], day)).toEqual([]);
  });

  test('single event produces one rollup with count=1', () => {
    const day = utcDay(2026, 4, 21);
    const events: RawEvent[] = [
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 21, 10, 0, 0)) },
    ];
    const result = aggregate(events, day);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      appId: 'zen-notes',
      day,
      eventType: 'session_start',
      count: 1,
    });
  });

  test('multiple events same (app,type) bucket merge into one row with summed count', () => {
    const day = utcDay(2026, 4, 21);
    const events: RawEvent[] = [
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 21, 1)) },
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 21, 12)) },
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 21, 23)) },
    ];
    const result = aggregate(events, day);
    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(3);
  });

  test('events outside the 24h window are ignored', () => {
    const day = utcDay(2026, 4, 21);
    const events: RawEvent[] = [
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 20, 23, 59, 59)) }, // before
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 21, 0, 0, 0)) }, // start (inclusive)
      { appId: 'zen-notes', eventType: 'session_start', ts: new Date(Date.UTC(2026, 3, 22, 0, 0, 0)) }, // end (exclusive)
    ];
    const result = aggregate(events, day);
    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(1);
  });

  test('distinct (app,type) pairs produce separate rows sorted by (appId, eventType)', () => {
    const day = utcDay(2026, 4, 21);
    const events: RawEvent[] = [
      { appId: 'b-app', eventType: 'click', ts: new Date(Date.UTC(2026, 3, 21, 5)) },
      { appId: 'a-app', eventType: 'view', ts: new Date(Date.UTC(2026, 3, 21, 6)) },
      { appId: 'a-app', eventType: 'click', ts: new Date(Date.UTC(2026, 3, 21, 7)) },
      { appId: 'a-app', eventType: 'click', ts: new Date(Date.UTC(2026, 3, 21, 8)) },
    ];
    const result = aggregate(events, day);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ appId: 'a-app', day, eventType: 'click', count: 2 });
    expect(result[1]).toEqual({ appId: 'a-app', day, eventType: 'view', count: 1 });
    expect(result[2]).toEqual({ appId: 'b-app', day, eventType: 'click', count: 1 });
  });
});
