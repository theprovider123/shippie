/**
 * Kitchen-now strategy.
 *
 * When the Cooking app has an active cook (a cooks-table row whose
 * finished_at is null) within the last 8 hours, surface a daily-briefing
 * card with the live status: "Brisket in pit, est. ready 7:42 PM."
 *
 * Provenance is the cooking app — daily-briefing must already declare
 * `consumes: cooking-now` for this insight to surface there. Until it
 * does, the insight still surfaces in the cooking app's own context
 * (it's its own provenance source).
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

interface CookPayload {
  cut_name?: string;
  method?: string;
  target_temp_c?: number;
  cook_minutes?: number;
  rest_minutes?: number;
  started_at?: string;
  finished_at?: string | null;
}

export const kitchenNowStrategy: AgentStrategy = {
  name: 'kitchen-now',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const cookingApp = ctx.apps.find((a) => a.provides?.includes('cooking-now'));
    if (!cookingApp) return [];

    // The most-recent active cook in the last 8h.
    const activeCooks = ctx.rows
      .filter((r) => r.appSlug === cookingApp.slug && r.table === 'cooks')
      .map((r) => ({ row: r, p: r.payload as CookPayload }))
      .filter(({ p, row }) => {
        if (p.finished_at) return false;
        const startMs = readMs(p.started_at, row.createdAt);
        return ctx.now - startMs < EIGHT_HOURS_MS && startMs <= ctx.now;
      })
      .sort((a, b) => readMs(b.p.started_at, b.row.createdAt) - readMs(a.p.started_at, a.row.createdAt));

    const top = activeCooks[0];
    if (!top) return [];

    const startMs = readMs(top.p.started_at, top.row.createdAt);
    const cookMin = top.p.cook_minutes ?? 0;
    const restMin = top.p.rest_minutes ?? 0;
    const estReadyMs = startMs + (cookMin + restMin) * 60_000;
    const cut = top.p.cut_name ?? 'a cook';
    const method = top.p.method ?? '';
    const ready = formatLocalTime(estReadyMs);

    return [
      {
        // ID by start-time so the card stays stable across ticks but
        // a new cook gets a fresh insight.
        id: `kitchen-now:${cookingApp.slug}:${startMs}`,
        strategy: 'kitchen-now',
        urgency: 'medium',
        title: `${cut}${method ? ` · ${method}` : ''}`,
        body:
          ctx.now < estReadyMs
            ? `Est. ready ${ready}.`
            : `Past est. ready (${ready}). Check the probe.`,
        target: { app: cookingApp.slug },
        generatedAt: ctx.now,
        expiresAt: estReadyMs + 30 * 60_000, // hide 30 min after est. ready
        provenance: [cookingApp.slug],
      },
    ];
  },
};

function readMs(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
}

function formatLocalTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
