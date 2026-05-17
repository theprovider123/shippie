/**
 * Magazine-shape narrative synthesiser for /glance.
 *
 * Takes the same intent-event window /today renders and synthesises a
 * one-paragraph "headline" — "yesterday: 3 coffees, 1 hour of focus,
 * slept 6.4h" — plus per-app sparkline data and a 7-day pattern read.
 *
 * Pure: takes events in, returns a render shape. No IndexedDB; the page
 * loads events via the store and passes them in.
 */

import type { IntentEvent } from './store';
import { labelFor, INTENT_LABELS } from './aggregates';

export interface NarrativeSentenceFragment {
  /** Short verb/noun ("3 coffees", "1 workout", "6.4h sleep"). */
  text: string;
  /** Source intent for backlink. */
  intent: string;
  /** Source app slug for backlink. */
  appId: string;
}

export interface DailyNarrative {
  /** Whole-sentence summary, e.g. "Yesterday you did 3 coffees, 1 workout, and slept 6.4h." */
  headline: string;
  /** Individual fragments — useful when the host wants to render as a list rather than a sentence. */
  fragments: readonly NarrativeSentenceFragment[];
  /** True if there's nothing to say. The page should show a prompt-to-install instead. */
  empty: boolean;
}

/**
 * Build a yesterday-shape narrative from the event window. Picks the
 * 3-5 most newsworthy intents and writes them as a sentence.
 */
export function buildDailyNarrative(events: readonly IntentEvent[]): DailyNarrative {
  if (events.length === 0) {
    return { headline: 'Nothing yet today.', fragments: [], empty: true };
  }

  // Bucket by intent.
  const byIntent = new Map<string, { count: number; appId: string; latestTs: number }>();
  for (const e of events) {
    const cur = byIntent.get(e.intent);
    if (cur) {
      cur.count += 1;
      if (e.ts > cur.latestTs) {
        cur.latestTs = e.ts;
        cur.appId = e.appId;
      }
    } else {
      byIntent.set(e.intent, { count: 1, appId: e.appId, latestTs: e.ts });
    }
  }

  // Pick the top 4 most-active intents with friendly labels (skip
  // unknowns — they'd render as raw slugs and break the prose).
  const ranked = [...byIntent.entries()]
    .filter(([intent]) => intent in INTENT_LABELS)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);

  if (ranked.length === 0) {
    return { headline: 'Some quiet activity today.', fragments: [], empty: false };
  }

  const fragments: NarrativeSentenceFragment[] = ranked.map(([intent, info]) => ({
    text: countPhrase(intent, info.count),
    intent,
    appId: info.appId,
  }));

  // Build the sentence with proper joining.
  const phrases = fragments.map((f) => f.text);
  let body: string;
  if (phrases.length === 1) {
    body = phrases[0]!;
  } else if (phrases.length === 2) {
    body = `${phrases[0]} and ${phrases[1]}`;
  } else {
    body = phrases.slice(0, -1).join(', ') + ', and ' + phrases[phrases.length - 1];
  }

  return {
    headline: `Today: ${body}.`,
    fragments,
    empty: false,
  };
}

function countPhrase(intent: string, count: number): string {
  // Map known intents to count-aware phrases. Most intents read as
  // "did N times" using the verbed label; some get domain-specific
  // pluralisation.
  const label = labelFor(intent);

  // Specific better-prose for the heavy hitters.
  switch (intent) {
    case 'coffee-brewed':
      return `${count} ${count === 1 ? 'coffee' : 'coffees'}`;
    case 'caffeine-logged':
      return `${count} caffeine ${count === 1 ? 'log' : 'logs'}`;
    case 'cooking-now':
      return `${count} ${count === 1 ? 'cook' : 'cooks'} started`;
    case 'cooked-meal':
      return `${count} ${count === 1 ? 'meal' : 'meals'} cooked`;
    case 'workout-completed':
      return `${count} ${count === 1 ? 'workout' : 'workouts'}`;
    case 'run-planned':
      return `${count} ${count === 1 ? 'run' : 'runs'} planned`;
    case 'sleep-logged':
      return count === 1 ? 'logged sleep' : `logged sleep ${count} times`;
    case 'focus-session':
      return `${count} ${count === 1 ? 'focus session' : 'focus sessions'}`;
    case 'mindful-session':
      return `${count} ${count === 1 ? 'mindful minute' : 'mindful sessions'}`;
    case 'mood-logged':
      return count === 1 ? 'a mood check-in' : `${count} mood check-ins`;
    case 'hydration-logged':
      return `${count} ${count === 1 ? 'drink' : 'drinks'} logged`;
    case 'expense-logged':
      return `${count} ${count === 1 ? 'expense' : 'expenses'} logged`;
    case 'memo-recorded':
      return `${count} voice ${count === 1 ? 'memo' : 'memos'}`;
    case 'cycle-logged':
      return count === 1 ? 'a cycle entry' : `${count} cycle entries`;
    case 'symptom-logged':
      return `${count} ${count === 1 ? 'symptom' : 'symptoms'} noted`;
    case 'journal-entry':
      return `${count} ${count === 1 ? 'journal entry' : 'journal entries'}`;
    case 'pantry-inventory':
      return count === 1 ? 'a pantry update' : `${count} pantry updates`;
    case 'chore-done':
      return `${count} ${count === 1 ? 'chore' : 'chores'} done`;
    case 'tab-item-added':
      return `${count} tab ${count === 1 ? 'item' : 'items'}`;
    default:
      return count === 1 ? label : `${label} ×${count}`;
  }
}

/**
 * 7-day pattern: per-app daily counts, ordered most-active-first.
 * Used by the sparkline section.
 */
export interface SevenDayPattern {
  appId: string;
  /** 7 entries oldest → newest, each = events that day for this app. */
  daily: readonly number[];
  total: number;
}

export function buildSevenDayPattern(
  events: readonly IntentEvent[],
  now: number = Date.now(),
): SevenDayPattern[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Map<string, number[]>();

  for (const e of events) {
    const daysAgo = Math.floor((now - e.ts) / dayMs);
    if (daysAgo < 0 || daysAgo >= 7) continue;
    const idx = 6 - daysAgo;
    let arr = buckets.get(e.appId);
    if (!arr) {
      arr = new Array(7).fill(0);
      buckets.set(e.appId, arr);
    }
    arr[idx] = (arr[idx] ?? 0) + 1;
  }

  return [...buckets.entries()]
    .map(([appId, daily]) => ({
      appId,
      daily,
      total: daily.reduce((s, d) => s + d, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Apps the user has shown they care about (intents fired) but that
 * have gone quiet for ≥7 days. Surfaces "use or archive" prompts.
 */
export interface QuietApp {
  appId: string;
  daysSinceLastUse: number;
}

export function findQuietApps(
  events: readonly IntentEvent[],
  now: number = Date.now(),
): QuietApp[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const lastByApp = new Map<string, number>();
  for (const e of events) {
    const cur = lastByApp.get(e.appId) ?? 0;
    if (e.ts > cur) lastByApp.set(e.appId, e.ts);
  }
  const out: QuietApp[] = [];
  for (const [appId, ts] of lastByApp) {
    const daysSince = Math.floor((now - ts) / dayMs);
    if (daysSince >= 7) out.push({ appId, daysSinceLastUse: daysSince });
  }
  return out.sort((a, b) => b.daysSinceLastUse - a.daysSinceLastUse);
}
