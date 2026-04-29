import { describe, expect, test } from 'bun:test';
import { scheduleAwarenessStrategy } from './schedule-awareness.ts';
import type { AgentContext } from '../types.ts';

const NOW = new Date('2026-04-28T12:00:00Z').getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

const journalApp = {
  slug: 'journal',
  name: 'Daily Journal',
  category: 'journal',
} as const;

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [journalApp],
    rows: [],
    ...overrides,
  };
}

describe('scheduleAwarenessStrategy', () => {
  test('stays silent when no journal app is installed', () => {
    expect(scheduleAwarenessStrategy.evaluate(ctx({ apps: [] }))).toEqual([]);
  });

  test('stays silent when there are no entries at all', () => {
    expect(scheduleAwarenessStrategy.evaluate(ctx())).toEqual([]);
  });

  test('stays silent when last entry was within 3 days', () => {
    const rows = [
      {
        appSlug: 'journal',
        table: 'entries',
        payload: {},
        createdAt: NOW - 2 * ONE_DAY,
      },
    ];
    expect(scheduleAwarenessStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('medium urgency at 4 days of silence', () => {
    const rows = [
      { appSlug: 'journal', table: 'entries', payload: {}, createdAt: NOW - 4.5 * ONE_DAY },
    ];
    const out = scheduleAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.urgency).toBe('medium');
    expect(out[0]?.title).toContain('4 days');
  });

  test('high urgency at 7+ days of silence', () => {
    const rows = [
      { appSlug: 'journal', table: 'entries', payload: {}, createdAt: NOW - 9 * ONE_DAY },
    ];
    const out = scheduleAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.urgency).toBe('high');
    expect(out[0]?.title).toContain('9 days');
  });

  test('target deep-links to the new-entry route', () => {
    const rows = [
      { appSlug: 'journal', table: 'entries', payload: {}, createdAt: NOW - 5 * ONE_DAY },
    ];
    const out = scheduleAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.target).toEqual({ app: 'journal', route: '/new' });
  });
});
