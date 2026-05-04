/**
 * Coffee-vs-sleep strategy.
 *
 * Cross-app insight: when the user has both Coffee and Sleep Logger
 * installed AND brewed coffee in the second half of the day, surface
 * a low-urgency nudge to push afternoon coffee earlier.
 *
 * v1 heuristic: any brew at or after 14:00 local time triggers. Future
 * iterations could mine sleep-logger for the user's typical bedtime
 * and use that as the cutoff (caffeine half-life ≈ 5-6 hours), but
 * the row shape isn't stable yet so the wall-clock heuristic is the
 * honest v1.
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const AFTERNOON_HOUR_LOCAL = 14; // 2pm — anything after counts as "late"

export const coffeeVsSleepStrategy: AgentStrategy = {
  name: 'coffee-vs-sleep',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const coffeeApp = ctx.apps.find((a) => a.provides?.includes('coffee-brewed'));
    const sleepApp = ctx.apps.find((a) => a.provides?.includes('sleep-logged'));
    if (!coffeeApp || !sleepApp) return [];

    // Today's coffee rows from the coffee app's namespace.
    const dayStart = startOfDayMs(ctx.now);
    const todayCoffees = ctx.rows.filter(
      (r) =>
        r.appSlug === coffeeApp.slug &&
        r.table === 'brews' &&
        r.createdAt >= dayStart &&
        r.createdAt <= ctx.now,
    );
    if (todayCoffees.length === 0) return [];

    // Pick the latest after-2pm brew, if any.
    const lateBrews = todayCoffees.filter((r) => {
      const brewedAt = readBrewedAt(r.payload, r.createdAt);
      return localHour(brewedAt) >= AFTERNOON_HOUR_LOCAL;
    });
    if (lateBrews.length === 0) return [];

    const latest = lateBrews.reduce((a, b) =>
      readBrewedAt(a.payload, a.createdAt) > readBrewedAt(b.payload, b.createdAt) ? a : b,
    );
    const latestAt = readBrewedAt(latest.payload, latest.createdAt);
    const hh = formatLocalTime(latestAt);

    // Don't re-fire within 6h — one nudge per afternoon is enough.
    return [
      {
        id: `coffee-vs-sleep:${dayBucket(ctx.now)}`,
        strategy: 'coffee-vs-sleep',
        urgency: 'low',
        title: `Afternoon coffee at ${hh}`,
        body: `Caffeine half-life is ~5h. A morning cap usually leaves a deeper night.`,
        target: { app: sleepApp.slug },
        generatedAt: ctx.now,
        expiresAt: dayStart + ONE_DAY_MS,
        provenance: [coffeeApp.slug, sleepApp.slug],
      },
    ];
  },
};

function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function localHour(ms: number): number {
  return new Date(ms).getHours();
}

function formatLocalTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function readBrewedAt(payload: unknown, fallback: number): number {
  if (payload && typeof payload === 'object' && 'brewed_at' in payload) {
    const v = (payload as { brewed_at: unknown }).brewed_at;
    if (typeof v === 'string') {
      const t = new Date(v).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return fallback;
}

// Re-export internals for tests; not part of the public API.
export const _internal = {
  startOfDayMs,
  localHour,
  formatLocalTime,
  readBrewedAt,
  AFTERNOON_HOUR_LOCAL,
  SIX_HOURS_MS,
};
