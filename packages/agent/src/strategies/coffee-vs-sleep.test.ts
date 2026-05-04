import { describe, expect, test } from 'bun:test';
import { coffeeVsSleepStrategy } from './coffee-vs-sleep.ts';
import type { AgentContext, AgentRow } from '../types.ts';

const NOW = new Date('2026-05-04T20:00:00').getTime(); // 8pm local

const coffeeApp = {
  slug: 'coffee',
  name: 'Coffee',
  provides: ['coffee-brewed', 'caffeine-logged'],
} as const;
const sleepApp = {
  slug: 'sleep-logger',
  name: 'Sleep Logger',
  provides: ['sleep-logged'],
} as const;

function brewRow(brewedAtIso: string): AgentRow {
  const t = new Date(brewedAtIso).getTime();
  return {
    appSlug: 'coffee',
    table: 'brews',
    payload: { brewed_at: brewedAtIso, method: 'v60' },
    createdAt: t,
  };
}

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [coffeeApp, sleepApp],
    rows: [],
    ...overrides,
  };
}

describe('coffeeVsSleepStrategy', () => {
  test('silent when only the coffee app is installed', () => {
    expect(coffeeVsSleepStrategy.evaluate(ctx({ apps: [coffeeApp] }))).toEqual([]);
  });

  test('silent when only sleep-logger is installed', () => {
    expect(coffeeVsSleepStrategy.evaluate(ctx({ apps: [sleepApp] }))).toEqual([]);
  });

  test('silent when no coffee was brewed today', () => {
    expect(coffeeVsSleepStrategy.evaluate(ctx({ rows: [] }))).toEqual([]);
  });

  test('silent for morning-only brews', () => {
    const rows = [brewRow('2026-05-04T08:30:00'), brewRow('2026-05-04T09:45:00')];
    expect(coffeeVsSleepStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('fires when an afternoon brew lands and points to sleep-logger', () => {
    const rows = [brewRow('2026-05-04T08:30:00'), brewRow('2026-05-04T15:30:00')];
    const out = coffeeVsSleepStrategy.evaluate(ctx({ rows }));
    expect(out).toHaveLength(1);
    expect(out[0]?.urgency).toBe('low');
    expect(out[0]?.target.app).toBe('sleep-logger');
    expect(out[0]?.provenance).toContain('coffee');
    expect(out[0]?.provenance).toContain('sleep-logger');
    expect(out[0]?.title).toContain('15:30');
  });

  test('insight id is stable for the same day (dedupes a re-tick)', () => {
    const rows = [brewRow('2026-05-04T15:30:00')];
    const a = coffeeVsSleepStrategy.evaluate(ctx({ rows }));
    const b = coffeeVsSleepStrategy.evaluate(ctx({ rows }));
    expect(a[0]?.id).toBe(b[0]?.id);
  });

  test('uses the latest after-2pm brew if there are several', () => {
    const rows = [
      brewRow('2026-05-04T14:30:00'),
      brewRow('2026-05-04T16:45:00'),
      brewRow('2026-05-04T17:15:00'),
    ];
    const out = coffeeVsSleepStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.title).toContain('17:15');
  });
});
