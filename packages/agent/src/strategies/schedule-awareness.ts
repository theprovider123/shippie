/**
 * Schedule-awareness strategy.
 *
 * Surfaces a journal/reminder gap: if the user has a journal-category
 * app installed but hasn't written an entry in N days, prompt them
 * gently. Tunes urgency by silence length: 4–6 days → medium, 7+ → high.
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const scheduleAwarenessStrategy: AgentStrategy = {
  name: 'schedule-awareness',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const journal = ctx.apps.find((a) => a.category === 'journal');
    if (!journal) return [];
    const lastEntry = ctx.rows
      .filter((r) => r.appSlug === journal.slug)
      .reduce((max, r) => Math.max(max, r.createdAt), 0);
    if (lastEntry === 0) return [];

    const silenceMs = ctx.now - lastEntry;
    const days = Math.floor(silenceMs / ONE_DAY_MS);
    if (days < 4) return [];

    const urgency = days >= 7 ? 'high' : 'medium';
    return [
      {
        id: `schedule-awareness:${journal.slug}:${dayBucket(ctx.now)}`,
        strategy: 'schedule-awareness',
        urgency,
        title: `${days} days since your last journal entry`,
        body: `Open ${journal.name} for a quick check-in.`,
        target: { app: journal.slug, route: '/new' },
        generatedAt: ctx.now,
        expiresAt: ctx.now + ONE_DAY_MS,
        // Single-app strategy: only the journal's own rows were read.
        provenance: [journal.slug],
      },
    ];
  },
};

function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
