/**
 * Pure aggregation helpers for /today.
 *
 * Decoupled from the IndexedDB layer so the rendering side is testable
 * with synthetic data.
 */

import type { IntentEvent } from './store';

export interface AppActivity {
  appId: string;
  count: number;
  lastSeen: number;
  intents: Array<{ intent: string; count: number; latestRow: unknown; latestTs: number }>;
}

export interface DailySummary {
  /** Window the summary covers, in ms. */
  windowMs: number;
  /** Earliest event timestamp in the window. */
  earliest: number | null;
  /** Latest event timestamp in the window. */
  latest: number | null;
  /** Total events in the window. */
  total: number;
  /** Per-app rollup, sorted most-recent-first. */
  apps: AppActivity[];
}

export function summarise(events: readonly IntentEvent[], windowMs: number): DailySummary {
  if (events.length === 0) {
    return { windowMs, earliest: null, latest: null, total: 0, apps: [] };
  }

  const byApp = new Map<string, AppActivity>();
  let earliest = Infinity;
  let latest = -Infinity;

  for (const e of events) {
    if (e.ts < earliest) earliest = e.ts;
    if (e.ts > latest) latest = e.ts;
    let app = byApp.get(e.appId);
    if (!app) {
      app = { appId: e.appId, count: 0, lastSeen: 0, intents: [] };
      byApp.set(e.appId, app);
    }
    app.count += 1;
    if (e.ts > app.lastSeen) app.lastSeen = e.ts;
    let intent = app.intents.find((i) => i.intent === e.intent);
    if (!intent) {
      intent = { intent: e.intent, count: 0, latestRow: e.row, latestTs: e.ts };
      app.intents.push(intent);
    }
    intent.count += 1;
    if (e.ts >= intent.latestTs) {
      intent.latestRow = e.row;
      intent.latestTs = e.ts;
    }
  }

  const apps = [...byApp.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  for (const a of apps) a.intents.sort((x, y) => y.count - x.count);

  return {
    windowMs,
    earliest: earliest === Infinity ? null : earliest,
    latest: latest === -Infinity ? null : latest,
    total: events.length,
    apps,
  };
}

/**
 * Fixed friendly labels for the well-known intents emitted by the
 * launch slate. Anything not in this map renders as the raw intent
 * name (acceptable degradation for third-party makers).
 */
export const INTENT_LABELS: Record<string, string> = {
  // Field Kitchen
  'coffee-brewed': 'brewed coffee',
  'caffeine-logged': 'caffeine logged',
  'dough-ferment-started': 'dough fermenting',
  'dough-ready': 'bread ready',
  'cooking-now': 'cooking now',
  'cooked-meal': 'cooked a meal',
  'hydration-logged': 'logged a drink',
  // Move
  'workout-completed': 'finished a workout',
  'run-planned': 'planned a run',
  'sleep-logged': 'logged sleep',
  // Quiet
  'mood-logged': 'logged mood',
  'focus-session': 'focus session',
  'mindful-session': 'mindful minutes',
  // Recipe / Pantry / Meal Planner
  'pantry-inventory': 'pantry updated',
  'pantry-low': 'pantry running low',
  'meal-planned': 'planned a meal',
  // Showcase logs
  'cycle-logged': 'logged cycle day',
  'cycle-window-predicted': 'predicted next cycle',
  'symptom-logged': 'logged a symptom',
  'med-taken': 'took medication',
  'expense-logged': 'logged an expense',
  'budget-limit': 'set a budget',
  'journal-entry': 'wrote in journal',
  'body-metrics-logged': 'logged body metrics',
  'story-made': 'made a story',
  'story-shared': 'shared a story',
  'trip-started': 'started a trip',
  'stop-pinned': 'pinned a stop',
  'trip-ended': 'ended a trip',
  'coparent-handover-noted': 'noted handover',
  'coparent-med-given': 'gave medication',
  'coparent-day-changed': 'changed schedule',
  'chore-done': 'finished a chore',
  'fridge-added': 'added to fridge',
  'dinner-eaten': 'ate dinner',
};

export function labelFor(intent: string): string {
  return INTENT_LABELS[intent] ?? intent;
}
