import { describe, expect, test } from 'bun:test';
import { budgetAwarenessStrategy } from './budget-awareness.ts';
import type { AgentContext } from '../types.ts';

const NOW = new Date('2026-04-28T12:00:00Z').getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

const financeApp = {
  slug: 'budget',
  name: 'Budget Tracker',
  category: 'finance',
} as const;

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    now: NOW,
    apps: [financeApp],
    rows: [],
    ...overrides,
  };
}

describe('budgetAwarenessStrategy', () => {
  test('stays silent without a finance app', () => {
    expect(budgetAwarenessStrategy.evaluate(ctx({ apps: [] }))).toEqual([]);
  });

  test('stays silent when no rows carry budget hints', () => {
    const rows = [
      { appSlug: 'budget', table: 'transactions', payload: { amount: 12 }, createdAt: NOW - ONE_DAY },
    ];
    expect(budgetAwarenessStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('reads explicit budgetRatio', () => {
    const rows = [
      { appSlug: 'budget', table: 'state', payload: { budgetRatio: 0.6 }, createdAt: NOW - ONE_DAY },
    ];
    const out = budgetAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.urgency).toBe('low');
    expect(out[0]?.title).toBe('Budget at 60%');
  });

  test('derives ratio from spent + limit', () => {
    const rows = [
      {
        appSlug: 'budget',
        table: 'state',
        payload: { spent: 850, limit: 1000 },
        createdAt: NOW - 2 * ONE_DAY,
      },
    ];
    const out = budgetAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.urgency).toBe('high');
    expect(out[0]?.title).toBe('Budget at 85%');
  });

  test('takes the highest ratio across recent rows', () => {
    const rows = [
      { appSlug: 'budget', table: 'state', payload: { budgetRatio: 0.4 }, createdAt: NOW - ONE_DAY },
      { appSlug: 'budget', table: 'state', payload: { budgetRatio: 0.92 }, createdAt: NOW - 2 * ONE_DAY },
    ];
    const out = budgetAwarenessStrategy.evaluate(ctx({ rows }));
    expect(out[0]?.title).toBe('Budget at 92%');
    expect(out[0]?.urgency).toBe('high');
  });

  test('ignores rows older than a week', () => {
    const rows = [
      {
        appSlug: 'budget',
        table: 'state',
        payload: { budgetRatio: 0.99 },
        createdAt: NOW - 14 * ONE_DAY,
      },
    ];
    expect(budgetAwarenessStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });

  test('rejects negative spent values', () => {
    const rows = [
      {
        appSlug: 'budget',
        table: 'state',
        payload: { spent: -10, limit: 100 },
        createdAt: NOW - ONE_DAY,
      },
    ];
    expect(budgetAwarenessStrategy.evaluate(ctx({ rows }))).toEqual([]);
  });
});
