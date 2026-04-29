import { describe, expect, test } from 'bun:test';
import { runAgent, DEFAULT_INSIGHT_CAP } from './runner.ts';
import type {
  AgentContext,
  AgentStrategy,
  Insight,
} from './types.ts';

const NOW = 1_700_000_000_000;

function strategyEmitting(...emit: Insight[]): AgentStrategy {
  return {
    name: emit[0]?.strategy ?? 'noop',
    evaluate: () => emit,
  };
}

const baseInsight = (over: Partial<Insight> = {}): Insight => ({
  id: 'x',
  strategy: 'test',
  urgency: 'low',
  title: 't',
  body: 'b',
  target: { app: 'demo' },
  generatedAt: NOW,
  provenance: ['demo'],
  ...over,
});

const baseCtx: AgentContext = { now: NOW, apps: [], rows: [] };

describe('runAgent', () => {
  test('returns no insights when strategies emit none', () => {
    const result = runAgent(baseCtx, [strategyEmitting()]);
    expect(result.insights).toEqual([]);
    expect(result.byStrategy).toEqual({ noop: 0 });
  });

  test('sorts by urgency: high → medium → low', () => {
    const s1 = strategyEmitting(baseInsight({ id: 'a', urgency: 'low', strategy: 'a' }));
    const s2 = strategyEmitting(baseInsight({ id: 'b', urgency: 'high', strategy: 'b' }));
    const s3 = strategyEmitting(baseInsight({ id: 'c', urgency: 'medium', strategy: 'c' }));
    const result = runAgent(baseCtx, [s1, s2, s3]);
    expect(result.insights.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  test('caps the result list at the default of 3', () => {
    const insights = Array.from({ length: 5 }, (_, i) =>
      baseInsight({ id: `i${i}`, urgency: 'medium', strategy: 's' }),
    );
    const result = runAgent(baseCtx, [strategyEmitting(...insights)]);
    expect(result.insights).toHaveLength(DEFAULT_INSIGHT_CAP);
  });

  test('respects a custom cap', () => {
    const insights = Array.from({ length: 5 }, (_, i) =>
      baseInsight({ id: `i${i}`, urgency: 'medium', strategy: 's' }),
    );
    const result = runAgent(baseCtx, [strategyEmitting(...insights)], { cap: 1 });
    expect(result.insights).toHaveLength(1);
  });

  test('skips insights whose ids are in recentInsightIds', () => {
    const a = baseInsight({ id: 'old', strategy: 's' });
    const b = baseInsight({ id: 'new', strategy: 's' });
    const result = runAgent(
      { ...baseCtx, recentInsightIds: new Set(['old']) },
      [strategyEmitting(a, b)],
    );
    expect(result.insights.map((i) => i.id)).toEqual(['new']);
  });

  test('skips insights that have already expired', () => {
    const expired = baseInsight({
      id: 'gone',
      strategy: 's',
      expiresAt: NOW - 1,
    });
    const live = baseInsight({ id: 'live', strategy: 's', expiresAt: NOW + 60_000 });
    const result = runAgent(baseCtx, [strategyEmitting(expired, live)]);
    expect(result.insights.map((i) => i.id)).toEqual(['live']);
  });

  test('byStrategy reports per-strategy counts', () => {
    const s1 = strategyEmitting(baseInsight({ id: 'a', strategy: 's1' }));
    const s2 = strategyEmitting(
      baseInsight({ id: 'b', strategy: 's2' }),
      baseInsight({ id: 'c', strategy: 's2' }),
    );
    const result = runAgent(baseCtx, [s1, s2]);
    expect(result.byStrategy).toEqual({ s1: 1, s2: 2 });
  });
});
