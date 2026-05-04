/**
 * Breath-on-low-mood strategy.
 *
 * When today's most recent mood-logged entry is ≤ 2/5, suggest a
 * 60-second breath session. Quiet on neutral or good days — we don't
 * want this firing every time the user opens the app.
 *
 * Targets the breath app slug if installed; falls back to pomodoro
 * (4-7-8 breathing fits inside a Pomodoro short-break) so the
 * insight is still actionable before Phase 5 lands.
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface MoodPayload {
  score?: number;
  note?: string | null;
  logged_at?: string;
}

export const breathOnLowMoodStrategy: AgentStrategy = {
  name: 'breath-on-low-mood',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const moodApp = ctx.apps.find((a) => a.provides?.includes('mood-logged'));
    if (!moodApp) return [];

    // Today's most-recent mood row. Mevrouw / mood-pulse both store one
    // canonical row per day; pick the latest by createdAt for safety.
    const dayStart = startOfDayMs(ctx.now);
    const todayMoods = ctx.rows
      .filter(
        (r) =>
          r.appSlug === moodApp.slug &&
          r.table === 'moods' &&
          r.createdAt >= dayStart &&
          r.createdAt <= ctx.now,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const latest = todayMoods[0];
    if (!latest) return [];

    const score = readScore(latest.payload);
    if (score === null || score > 2) return [];

    // Pick the best-fit destination app.
    const breathApp = ctx.apps.find((a) => a.provides?.includes('mindful-session'));
    const pomodoroApp = ctx.apps.find((a) => a.provides?.includes('focus-session'));
    const target = breathApp ?? pomodoroApp;
    if (!target) return [];

    return [
      {
        id: `breath-on-low-mood:${dayBucket(ctx.now)}`,
        strategy: 'breath-on-low-mood',
        urgency: score <= 1 ? 'medium' : 'low',
        title: '60-second breath?',
        body:
          target.slug === breathApp?.slug
            ? `One round of 4-7-8 takes a minute. Worth it.`
            : `Try a short box-breath in the Pomodoro break — one minute.`,
        target: { app: target.slug },
        generatedAt: ctx.now,
        expiresAt: dayStart + ONE_DAY_MS,
        provenance: [moodApp.slug, target.slug],
      },
    ];
  },
};

function readScore(payload: unknown): number | null {
  if (payload && typeof payload === 'object' && 'score' in payload) {
    const v = (payload as MoodPayload).score;
    if (typeof v === 'number' && v >= 1 && v <= 5) return v;
  }
  return null;
}

function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
