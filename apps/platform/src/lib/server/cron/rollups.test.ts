import { describe, expect, test } from 'vitest';
import { aggregate, type RawEvent } from './rollups';

describe('rollups.aggregate', () => {
  const day = new Date(Date.UTC(2026, 3, 23, 0, 0, 0, 0));

  test('empty input → no rows', () => {
    expect(aggregate([], day)).toEqual([]);
  });

  test('counts events per (app, type) within the day window', () => {
    const events: RawEvent[] = [
      { appId: 'a', eventType: 'click', ts: '2026-04-23T10:00:00Z' },
      { appId: 'a', eventType: 'click', ts: '2026-04-23T11:00:00Z' },
      { appId: 'a', eventType: 'view', ts: '2026-04-23T12:00:00Z' },
      { appId: 'b', eventType: 'click', ts: '2026-04-23T13:00:00Z' },
    ];
    const out = aggregate(events, day);
    expect(out).toEqual([
      { appId: 'a', day: '2026-04-23', eventType: 'click', count: 2 },
      { appId: 'a', day: '2026-04-23', eventType: 'view', count: 1 },
      { appId: 'b', day: '2026-04-23', eventType: 'click', count: 1 },
    ]);
  });

  test('drops events outside the window', () => {
    const events: RawEvent[] = [
      { appId: 'a', eventType: 'click', ts: '2026-04-22T23:59:59Z' }, // day before
      { appId: 'a', eventType: 'click', ts: '2026-04-23T00:00:00Z' }, // start of day
      { appId: 'a', eventType: 'click', ts: '2026-04-24T00:00:00Z' }, // end-exclusive
    ];
    const out = aggregate(events, day);
    expect(out).toEqual([{ appId: 'a', day: '2026-04-23', eventType: 'click', count: 1 }]);
  });

  test('ignores invalid timestamps', () => {
    const events: RawEvent[] = [
      { appId: 'a', eventType: 'click', ts: 'not-a-date' },
      { appId: 'a', eventType: 'click', ts: '2026-04-23T10:00:00Z' },
    ];
    const out = aggregate(events, day);
    expect(out).toEqual([{ appId: 'a', day: '2026-04-23', eventType: 'click', count: 1 }]);
  });
});
