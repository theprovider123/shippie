import { describe, expect, test } from 'bun:test';
import { kitchenNowStrategy } from './kitchen-now.ts';
import type { AgentContext, AgentRow } from '../types.ts';

const NOW = new Date('2026-05-04T18:30:00').getTime();

const cookingApp = {
  slug: 'cooking',
  name: 'Cooking',
  provides: ['cooking-now', 'cooked-meal'],
} as const;

function cookRow(overrides: Partial<{
  startedAt: string;
  finishedAt: string | null;
  cutName: string;
  method: string;
  cookMinutes: number;
  restMinutes: number;
}>): AgentRow {
  const startedAt = overrides.startedAt ?? '2026-05-04T17:00:00';
  return {
    appSlug: 'cooking',
    table: 'cooks',
    payload: {
      cut_name: overrides.cutName ?? 'Steak',
      method: overrides.method ?? 'pan',
      cook_minutes: overrides.cookMinutes ?? 6,
      rest_minutes: overrides.restMinutes ?? 4,
      started_at: startedAt,
      finished_at: overrides.finishedAt ?? null,
    },
    createdAt: new Date(startedAt).getTime(),
  };
}

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [cookingApp],
    rows: [],
    ...overrides,
  };
}

describe('kitchenNowStrategy', () => {
  test('silent without the cooking app', () => {
    expect(kitchenNowStrategy.evaluate(ctx({ apps: [] }))).toEqual([]);
  });

  test('silent when no active cook', () => {
    const rows = [cookRow({ finishedAt: '2026-05-04T17:30:00' })];
    expect(kitchenNowStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('silent when the cook started over 8 hours ago', () => {
    const rows = [cookRow({ startedAt: '2026-05-04T08:00:00' })];
    expect(kitchenNowStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('fires when an active cook exists; estimates ready time from start + cook + rest', () => {
    const rows = [cookRow({ cutName: 'Brisket', method: 'smoke', cookMinutes: 360, restMinutes: 60 })];
    // started 2026-05-04T17:00, +6h cook +1h rest = 24:00 (midnight)
    const out = kitchenNowStrategy.evaluate(ctx({ rows }));
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain('Brisket');
    expect(out[0]?.title).toContain('smoke');
    expect(out[0]?.body).toContain('Est. ready');
  });

  test('flags when current time is past estimated ready', () => {
    const rows = [
      cookRow({
        startedAt: '2026-05-04T17:00:00',
        cookMinutes: 6,
        restMinutes: 4,
      }),
    ];
    // start 17:00 + 10min = 17:10; NOW = 18:30, well past.
    const out = kitchenNowStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.body).toContain('Past est. ready');
  });

  test('picks the most-recent active cook when multiple are active', () => {
    const rows = [
      cookRow({ startedAt: '2026-05-04T15:00:00', cutName: 'Roast', cookMinutes: 240 }),
      cookRow({ startedAt: '2026-05-04T17:30:00', cutName: 'Salmon' }),
    ];
    const out = kitchenNowStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.title).toContain('Salmon');
  });
});
