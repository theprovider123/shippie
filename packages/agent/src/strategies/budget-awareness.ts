/**
 * Budget-awareness strategy.
 *
 * Cross-app insight: when a finance-category app is installed alongside
 * a journal/log-category app, surface a tail-of-month spending check-in.
 * Promotes to high urgency when the budget signal in the row payload
 * indicates the user is at >=85% of their declared limit.
 *
 * Strategies stay heuristic-light — they parse what's plainly there and
 * never invent numbers. If the payload doesn't carry a budget hint,
 * the strategy stays silent.
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_URGENCY_RATIO = 0.85;

export const budgetAwarenessStrategy: AgentStrategy = {
  name: 'budget-awareness',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const finance = ctx.apps.find((a) => a.category === 'finance');
    if (!finance) return [];
    const recent = ctx.rows.filter(
      (r) => r.appSlug === finance.slug && ctx.now - r.createdAt < ONE_DAY_MS * 7,
    );
    if (recent.length === 0) return [];

    let highest: { ratio: number; row: (typeof recent)[number] } | null = null;
    for (const row of recent) {
      const ratio = readBudgetRatio(row.payload);
      if (ratio == null) continue;
      if (!highest || ratio > highest.ratio) {
        highest = { ratio, row };
      }
    }
    if (!highest) return [];

    const urgency = highest.ratio >= HIGH_URGENCY_RATIO ? 'high' : 'low';
    const pct = Math.round(highest.ratio * 100);
    return [
      {
        id: `budget-awareness:${finance.slug}:${dayBucket(ctx.now)}`,
        strategy: 'budget-awareness',
        urgency,
        title: `Budget at ${pct}%`,
        body: `Open ${finance.name} to see what's been spent.`,
        target: { app: finance.slug },
        generatedAt: ctx.now,
        expiresAt: ctx.now + ONE_DAY_MS,
      },
    ];
  },
};

function readBudgetRatio(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  // Accept several shapes: explicit ratio, or spent + limit.
  const ratio = obj.budgetRatio;
  if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0) {
    return Math.min(1.5, ratio);
  }
  const spent = obj.spent;
  const limit = obj.limit;
  if (
    typeof spent === 'number' &&
    typeof limit === 'number' &&
    limit > 0 &&
    spent >= 0 &&
    Number.isFinite(spent) &&
    Number.isFinite(limit)
  ) {
    return Math.min(1.5, spent / limit);
  }
  return null;
}

function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
