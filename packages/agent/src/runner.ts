/**
 * Agent runner — composes strategies, dedupes, sorts, caps.
 *
 * The Svelte container calls `runAgent({ now, apps, rows, strategies })`
 * once on Home open and on a low-frequency tick. Strategies stay pure;
 * the runner handles ordering and overflow.
 */
import type {
  AgentContext,
  AgentRunResult,
  AgentStrategy,
  AgentUrgency,
  Insight,
} from './types.ts';

const URGENCY_RANK: Record<AgentUrgency, number> = { high: 3, medium: 2, low: 1 };

export const DEFAULT_INSIGHT_CAP = 3;

export interface RunOptions {
  /** Maximum number of insights to surface at once. Defaults to 3. */
  cap?: number;
}

export function runAgent(
  ctx: AgentContext,
  strategies: readonly AgentStrategy[],
  opts: RunOptions = {},
): AgentRunResult {
  const cap = opts.cap ?? DEFAULT_INSIGHT_CAP;
  const byStrategy: Record<string, number> = {};
  const all: Insight[] = [];
  for (const strategy of strategies) {
    let count = 0;
    for (const insight of strategy.evaluate(ctx)) {
      // Honor recentInsightIds — strategies can dedupe themselves but
      // the runner enforces it as a final guard.
      if (ctx.recentInsightIds?.has(insight.id)) continue;
      // Drop expired insights — strategies should not emit them, but
      // belt-and-braces.
      if (insight.expiresAt != null && insight.expiresAt <= ctx.now) continue;
      all.push(insight);
      count += 1;
    }
    byStrategy[strategy.name] = count;
  }

  const sorted = [...all].sort((a, b) => {
    const r = URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency];
    if (r !== 0) return r;
    return b.generatedAt - a.generatedAt;
  });

  return {
    insights: sorted.slice(0, cap),
    byStrategy,
  };
}
