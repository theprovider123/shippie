/**
 * Pattern tracker — derives a `PatternsRollup` from recent page-view history.
 *
 * The rollup answers three questions a host app may ask of `local.intelligence`:
 *
 *   1. "What does a typical session look like?" — `typicalSessions` returns the
 *      most recent few session slices, each annotated with a primary action
 *      (the path the user spent the most cumulative time on, falling back to
 *      visit count when no durations were recorded).
 *
 *   2. "What sequences does the user repeat?" — `frequentPaths` extracts
 *      consecutive N-grams (length >=3) from each session's page sequence and
 *      returns the top 5 most frequent ones across all sessions.
 *
 *   3. "When + where does the user typically use the app?" — `preferences`
 *      surfaces the most-visited path, the average session duration, and the
 *      hour-of-day mode.
 *
 * Sessions are bucketed greedily: views are walked in time order; a gap of
 * more than `SESSION_GAP_MS` ends the previous session and starts a new one.
 */
import { listPageViews } from './storage.ts';
import type { PageView, PatternsRollup, SessionSlice } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 5 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const VIEW_LIMIT = 5000;
const TYPICAL_SESSION_COUNT = 5;
const NGRAM_MIN_LENGTH = 3;
const FREQUENT_PATHS_TOP_N = 5;

interface InternalSession {
  views: Array<PageView & { id: number }>;
  start: number;
  end: number;
}

function daysAgo(days: number, now: number = Date.now()): number {
  return now - days * DAY_MS;
}

/**
 * Bucket page views (already sorted by `ts` ascending out of `listPageViews`)
 * into sessions, splitting whenever the gap between consecutive views exceeds
 * `gapMs`. The session's end is the start of its last view; if the last view
 * has a `durationMs`, the end advances by that duration so single-view
 * sessions still report a real length.
 */
export function bucketSessions(
  views: Array<PageView & { id: number }>,
  gapMs: number,
): InternalSession[] {
  if (views.length === 0) return [];
  const sessions: InternalSession[] = [];
  let current: InternalSession | null = null;
  for (const view of views) {
    if (!current) {
      current = { views: [view], start: view.ts, end: view.ts };
      continue;
    }
    const lastTs = current.views[current.views.length - 1]!.ts;
    if (view.ts - lastTs > gapMs) {
      finalizeSessionEnd(current);
      sessions.push(current);
      current = { views: [view], start: view.ts, end: view.ts };
    } else {
      current.views.push(view);
      current.end = view.ts;
    }
  }
  if (current) {
    finalizeSessionEnd(current);
    sessions.push(current);
  }
  return sessions;
}

function finalizeSessionEnd(session: InternalSession): void {
  const last = session.views[session.views.length - 1];
  if (last?.durationMs && last.durationMs > 0) {
    session.end = last.ts + last.durationMs;
  }
}

/**
 * Pick the path the user spent the most time on within a session. Uses
 * `durationMs` when available; if the session contains no positive durations
 * (e.g. an active session whose last view hasn't been navigated away from),
 * falls back to visit count.
 */
export function primaryActionFor(session: InternalSession): string | undefined {
  if (session.views.length === 0) return undefined;
  const dwellByPath = new Map<string, number>();
  let totalDwell = 0;
  for (const view of session.views) {
    const dwell = view.durationMs && view.durationMs > 0 ? view.durationMs : 0;
    totalDwell += dwell;
    dwellByPath.set(view.path, (dwellByPath.get(view.path) ?? 0) + dwell);
  }
  if (totalDwell > 0) return modeFromMap(dwellByPath);
  const countByPath = new Map<string, number>();
  for (const view of session.views) {
    countByPath.set(view.path, (countByPath.get(view.path) ?? 0) + 1);
  }
  return modeFromMap(countByPath);
}

function modeFromMap(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = -Infinity;
  // Map iteration preserves insertion order, so ties resolve to the
  // earliest-inserted (i.e. earliest-seen) path — stable + intuitive.
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Extract the top `topN` most frequent N-grams (consecutive subsequences) of
 * length >= `minLen` across the supplied page-sequences.
 */
export function topNgrams(
  sequences: string[][],
  minLen: number,
  topN: number,
): string[][] {
  const counts = new Map<string, { sequence: string[]; count: number }>();
  for (const seq of sequences) {
    if (seq.length < minLen) continue;
    for (let len = minLen; len <= seq.length; len += 1) {
      for (let start = 0; start + len <= seq.length; start += 1) {
        const window = seq.slice(start, start + len);
        const key = window.join('');
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { sequence: window, count: 1 });
        }
      }
    }
  }
  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // Prefer longer n-grams when counts tie — they're the more specific
      // signal.
      return b.sequence.length - a.sequence.length;
    })
    .slice(0, topN)
    .map((entry) => entry.sequence);
}

/**
 * Derive the `preferences` slice of the rollup: most-visited path (overall
 * count), arithmetic mean of session durations, and the mode of view-start
 * hours of day.
 */
export function derivePreferences(
  views: Array<PageView & { id: number }>,
  sessions: InternalSession[],
): PatternsRollup['preferences'] {
  const mostVisitedPath = mostVisited(views);
  const averageSessionDurationMs = sessions.length === 0
    ? 0
    : sessions.reduce((acc, s) => acc + (s.end - s.start), 0) / sessions.length;
  const peakUsageHour = peakHour(views);
  return {
    mostVisitedPath,
    averageSessionDurationMs,
    peakUsageHour,
  };
}

function mostVisited(views: Array<PageView & { id: number }>): string | null {
  if (views.length === 0) return null;
  const counts = new Map<string, number>();
  for (const view of views) {
    counts.set(view.path, (counts.get(view.path) ?? 0) + 1);
  }
  return modeFromMap(counts) ?? null;
}

function peakHour(views: Array<PageView & { id: number }>): number | null {
  if (views.length === 0) return null;
  const histogram = new Array<number>(24).fill(0);
  for (const view of views) {
    const hour = new Date(view.ts).getHours();
    if (Number.isFinite(hour) && hour >= 0 && hour < 24) {
      histogram[hour] = (histogram[hour] ?? 0) + 1;
    }
  }
  let bestHour = -1;
  let bestCount = -Infinity;
  for (let h = 0; h < 24; h += 1) {
    const count = histogram[h] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestHour = h;
    }
  }
  return bestHour >= 0 ? bestHour : null;
}

function toSessionSlice(session: InternalSession): SessionSlice {
  const slice: SessionSlice = {
    start: session.start,
    end: session.end,
    pages: session.views.map((v) => v.path),
  };
  const primary = primaryActionFor(session);
  if (primary !== undefined) slice.primaryAction = primary;
  return slice;
}

/**
 * Compute a rolled-up summary of recent activity. Reads the last 30 days
 * (capped at 5,000 views) from storage.
 */
export async function patterns(): Promise<PatternsRollup> {
  const views = await listPageViews({ since: daysAgo(LOOKBACK_DAYS), limit: VIEW_LIMIT });
  const sessions = bucketSessions(views, SESSION_GAP_MS);
  const typical = sessions.slice(-TYPICAL_SESSION_COUNT).map(toSessionSlice);
  const sequences = sessions.map((s) => s.views.map((v) => v.path));
  return {
    recentViews: views.length,
    typicalSessions: typical,
    frequentPaths: topNgrams(sequences, NGRAM_MIN_LENGTH, FREQUENT_PATHS_TOP_N),
    preferences: derivePreferences(views, sessions),
  };
}
