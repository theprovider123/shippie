import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  bucketSessions,
  derivePreferences,
  patterns,
  primaryActionFor,
  topNgrams,
} from './pattern-tracker.ts';
import { _resetIntelligenceDbForTest, appendPageView } from './storage.ts';
import type { PageView } from './types.ts';

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const FIVE_MIN = 5 * MINUTE;

/** Convenience: build a synthetic PageView-with-id for unit tests of pure helpers. */
function v(
  path: string,
  ts: number,
  durationMs?: number,
  id = ts,
): PageView & { id: number } {
  const view: PageView & { id: number } = { path, ts, id };
  if (durationMs !== undefined) view.durationMs = durationMs;
  return view;
}

describe('pattern-tracker/bucketSessions', () => {
  test('returns no sessions for empty input', () => {
    expect(bucketSessions([], FIVE_MIN)).toEqual([]);
  });

  test('keeps consecutive views within gap in one session', () => {
    const views = [
      v('/a', 1_000_000),
      v('/b', 1_000_000 + 30 * SECOND),
      v('/c', 1_000_000 + 2 * MINUTE),
    ];
    const sessions = bucketSessions(views, FIVE_MIN);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.views.map((view) => view.path)).toEqual(['/a', '/b', '/c']);
  });

  test('splits when gap exceeds 5 minutes', () => {
    const t0 = 1_700_000_000_000;
    const views = [
      v('/a', t0),
      v('/b', t0 + 60 * SECOND),
      // 6-minute gap → new session
      v('/c', t0 + 60 * SECOND + 6 * MINUTE),
      v('/d', t0 + 60 * SECOND + 6 * MINUTE + 30 * SECOND),
    ];
    const sessions = bucketSessions(views, FIVE_MIN);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.views.map((view) => view.path)).toEqual(['/a', '/b']);
    expect(sessions[1]?.views.map((view) => view.path)).toEqual(['/c', '/d']);
  });

  test('does NOT split exactly at the gap boundary (>, not >=)', () => {
    const t0 = 1_700_000_000_000;
    const views = [v('/a', t0), v('/b', t0 + FIVE_MIN)];
    const sessions = bucketSessions(views, FIVE_MIN);
    expect(sessions).toHaveLength(1);
  });

  test('end advances by trailing durationMs when present', () => {
    const t0 = 1_700_000_000_000;
    const views = [v('/a', t0, 30 * SECOND), v('/b', t0 + MINUTE, 90 * SECOND)];
    const sessions = bucketSessions(views, FIVE_MIN);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.start).toBe(t0);
    // last view ts (t0 + MINUTE) + its durationMs (90s)
    expect(sessions[0]?.end).toBe(t0 + MINUTE + 90 * SECOND);
  });
});

describe('pattern-tracker/primaryActionFor', () => {
  test('picks path with longest cumulative dwell', () => {
    const t0 = 1_700_000_000_000;
    const session = {
      start: t0,
      end: t0 + 10 * MINUTE,
      views: [
        v('/recipes', t0, 30 * SECOND),
        v('/recipes/pasta', t0 + 30 * SECOND, 5 * MINUTE),
        v('/recipes/pasta', t0 + 6 * MINUTE, 4 * MINUTE),
      ],
    };
    expect(primaryActionFor(session)).toBe('/recipes/pasta');
  });

  test('falls back to visit-count when all durations are zero', () => {
    const t0 = 1_700_000_000_000;
    const session = {
      start: t0,
      end: t0,
      views: [
        v('/a', t0),
        v('/b', t0 + 1),
        v('/b', t0 + 2),
        v('/b', t0 + 3),
        v('/c', t0 + 4),
      ],
    };
    expect(primaryActionFor(session)).toBe('/b');
  });

  test('returns undefined for an empty session', () => {
    expect(primaryActionFor({ start: 0, end: 0, views: [] })).toBeUndefined();
  });
});

describe('pattern-tracker/topNgrams', () => {
  test('extracts most frequent length-3+ subsequences', () => {
    const sequences = [
      ['/', '/recipes', '/recipes/1'],
      ['/', '/recipes', '/recipes/1'],
      ['/', '/recipes', '/recipes/1', '/cart'],
      ['/dashboard', '/profile'], // too short, skipped
    ];
    const top = topNgrams(sequences, 3, 5);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]).toEqual(['/', '/recipes', '/recipes/1']);
  });

  test('returns empty array when no n-gram repeats', () => {
    const sequences = [
      ['/a', '/b', '/c'],
      ['/d', '/e', '/f'],
    ];
    expect(topNgrams(sequences, 3, 5)).toEqual([]);
  });

  test('respects topN cap', () => {
    const sequences = Array.from({ length: 4 }, () => [
      '/x',
      '/y',
      '/z',
      '/w',
      '/q',
    ]);
    const top = topNgrams(sequences, 3, 2);
    expect(top.length).toBeLessThanOrEqual(2);
  });

  test('skips sequences shorter than minLen', () => {
    const sequences = [['/a', '/b'], ['/a', '/b'], ['/a', '/b']];
    expect(topNgrams(sequences, 3, 5)).toEqual([]);
  });
});

describe('pattern-tracker/derivePreferences', () => {
  test('returns zero/null preferences for empty inputs', () => {
    const prefs = derivePreferences([], []);
    expect(prefs.mostVisitedPath).toBeNull();
    expect(prefs.averageSessionDurationMs).toBe(0);
    expect(prefs.peakUsageHour).toBeNull();
  });

  test('computes mostVisitedPath, average duration, and peakUsageHour', () => {
    // Build views all at the same hour-of-day so peak-hour mode is deterministic
    // regardless of the host machine's timezone: take a base date, then set
    // its hour explicitly via local-time math.
    const base = new Date(2026, 3, 20, 18, 0, 0, 0).getTime(); // Mon 18:00 local
    const views = [
      { path: '/', ts: base, id: 1 },
      { path: '/recipes', ts: base + MINUTE, id: 2 },
      { path: '/recipes', ts: base + 2 * MINUTE, id: 3 },
      { path: '/recipes', ts: base + 3 * MINUTE, id: 4 },
    ] satisfies Array<PageView & { id: number }>;
    const sessions = bucketSessions(views, FIVE_MIN);
    const prefs = derivePreferences(views, sessions);
    expect(prefs.mostVisitedPath).toBe('/recipes');
    expect(prefs.peakUsageHour).toBe(18);
    expect(prefs.averageSessionDurationMs).toBeGreaterThan(0);
  });
});

describe('pattern-tracker/patterns()', () => {
  test('empty-data fallback: returns rollup with zeros and nulls', async () => {
    const rollup = await patterns();
    expect(rollup.recentViews).toBe(0);
    expect(rollup.typicalSessions).toEqual([]);
    expect(rollup.frequentPaths).toEqual([]);
    expect(rollup.preferences.mostVisitedPath).toBeNull();
    expect(rollup.preferences.averageSessionDurationMs).toBe(0);
    expect(rollup.preferences.peakUsageHour).toBeNull();
  });

  test('end-to-end: synthetic seeded views produce expected rollup', async () => {
    // Two sessions at distinct days/times. We build them around the *current*
    // wall-clock so the 30-day lookback in patterns() includes them, and we
    // pick the same hour for every view so peakUsageHour is unambiguous.
    const now = Date.now();
    const sessionAStart = now - 3 * 24 * 60 * 60 * 1000; // 3 days ago
    const sessionBStart = now - 2 * 24 * 60 * 60 * 1000; // 2 days ago
    // Force both sessions to the same hour-of-day for a stable mode.
    const aDate = new Date(sessionAStart);
    aDate.setHours(18, 0, 0, 0);
    const bDate = new Date(sessionBStart);
    bDate.setHours(18, 0, 0, 0);
    const aBase = aDate.getTime();
    const bBase = bDate.getTime();

    // Session A: browse recipes, dwell longest on /recipes/pasta
    await appendPageView({ path: '/', ts: aBase, durationMs: 10 * SECOND });
    await appendPageView({
      path: '/recipes',
      ts: aBase + 10 * SECOND,
      durationMs: 30 * SECOND,
    });
    await appendPageView({
      path: '/recipes/pasta',
      ts: aBase + 40 * SECOND,
      durationMs: 8 * MINUTE,
    });

    // Session B (>5min after session A): same path-shape so the n-gram
    // ['/', '/recipes', '/recipes/pasta'] repeats.
    await appendPageView({ path: '/', ts: bBase, durationMs: 5 * SECOND });
    await appendPageView({
      path: '/recipes',
      ts: bBase + 5 * SECOND,
      durationMs: 20 * SECOND,
    });
    await appendPageView({
      path: '/recipes/pasta',
      ts: bBase + 25 * SECOND,
      durationMs: 12 * MINUTE,
    });

    const rollup = await patterns();
    expect(rollup.recentViews).toBe(6);
    expect(rollup.typicalSessions).toHaveLength(2);
    expect(rollup.typicalSessions[0]?.primaryAction).toBe('/recipes/pasta');
    expect(rollup.typicalSessions[1]?.primaryAction).toBe('/recipes/pasta');
    // Frequent n-gram (length 3) appears in both sessions → top result.
    expect(rollup.frequentPaths[0]).toEqual(['/', '/recipes', '/recipes/pasta']);
    expect(rollup.preferences.mostVisitedPath).toBe('/');
    expect(rollup.preferences.peakUsageHour).toBe(18);
    expect(rollup.preferences.averageSessionDurationMs).toBeGreaterThan(0);
  });

  test('5-minute-gap splits a continuous burst into two sessions', async () => {
    const now = Date.now();
    const base = now - 1 * 24 * 60 * 60 * 1000;
    const d = new Date(base);
    d.setHours(9, 0, 0, 0);
    const t0 = d.getTime();

    await appendPageView({ path: '/p1', ts: t0, durationMs: SECOND });
    await appendPageView({ path: '/p2', ts: t0 + SECOND, durationMs: SECOND });
    // 6-minute gap
    await appendPageView({
      path: '/p3',
      ts: t0 + SECOND + 6 * MINUTE,
      durationMs: SECOND,
    });
    await appendPageView({
      path: '/p4',
      ts: t0 + 2 * SECOND + 6 * MINUTE,
      durationMs: SECOND,
    });

    const rollup = await patterns();
    expect(rollup.typicalSessions).toHaveLength(2);
    expect(rollup.typicalSessions[0]?.pages).toEqual(['/p1', '/p2']);
    expect(rollup.typicalSessions[1]?.pages).toEqual(['/p3', '/p4']);
  });
});
