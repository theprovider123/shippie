/**
 * Temporal context deriver.
 *
 * Maps the current wall-clock time to a coarse `timeOfDay` bucket and a
 * lowercase `dayOfWeek`, then asks: "given the user's past sessions in this
 * same time-of-day bucket, how long do they typically engage?" The median of
 * those past session durations becomes `expectedSessionDurationMs`, which is
 * then bucketed into 'short' / 'medium' / 'extended' for ergonomic gating in
 * UI ("you have a moment, here's a quick task" vs "you've got time, here's
 * something deeper").
 *
 * Session bucketing duplicates the helper in `pattern-tracker.ts` (>5min
 * inactivity gap = new session). The plan explicitly says duplication is fine
 * here — extracting a shared helper would increase coupling between two files
 * the rest of the package treats as independent.
 */
import { listPageViews } from './storage.ts';
import type { PageView, TemporalContext } from './types.ts';

const SESSION_GAP_MS = 5 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const MAX_VIEWS = 5000;

const DAY_OF_WEEK: TemporalContext['dayOfWeek'][] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface TemporalContextOptions {
  /** Wall-clock ms; defaults to Date.now(). */
  now?: number;
}

/** Buckets an hour (0-23) into a time-of-day label. */
function bucketHour(hour: number): TemporalContext['timeOfDay'] {
  if (hour >= 5 && hour < 9) return 'early-morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  // 21-23 and 0-4 — wrap-around range.
  return 'night';
}

interface Session {
  start: number;
  end: number;
}

/**
 * Bucket a chronological list of page views into sessions. A new session
 * begins whenever the gap between consecutive views exceeds SESSION_GAP_MS.
 * Each session's `end` is the start of its last view plus its `durationMs`
 * (or the start itself if duration is unknown — we'd rather understate than
 * overstate session length).
 */
function bucketSessions(views: Array<PageView & { id: number }>): Session[] {
  if (views.length === 0) return [];
  const sorted = [...views].sort((a, b) => a.ts - b.ts);
  const sessions: Session[] = [];
  let currentStart = sorted[0]!.ts;
  let currentEnd = sorted[0]!.ts + (sorted[0]!.durationMs ?? 0);

  for (let i = 1; i < sorted.length; i += 1) {
    const v = sorted[i]!;
    if (v.ts - currentEnd > SESSION_GAP_MS) {
      sessions.push({ start: currentStart, end: currentEnd });
      currentStart = v.ts;
      currentEnd = v.ts + (v.durationMs ?? 0);
    } else {
      currentEnd = Math.max(currentEnd, v.ts + (v.durationMs ?? 0));
    }
  }
  sessions.push({ start: currentStart, end: currentEnd });
  return sessions;
}

/** Median of a number array. Returns 0 for empty input. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function bucketAvailableTime(medianMs: number): TemporalContext['availableTime'] {
  if (medianMs < 5 * 60 * 1000) return 'short';
  if (medianMs < 20 * 60 * 1000) return 'medium';
  return 'extended';
}

function daysAgo(days: number, fromMs: number): number {
  return fromMs - days * 24 * 60 * 60 * 1000;
}

/**
 * Derive the user's current temporal context from past page-view history.
 * Always returns a value: with no history, falls back to `availableTime:
 * 'short'` and `expectedSessionDurationMs: 0`.
 */
export async function temporalContext(
  opts?: TemporalContextOptions,
): Promise<TemporalContext> {
  const now = opts?.now ?? Date.now();
  const nowDate = new Date(now);
  const timeOfDay = bucketHour(nowDate.getHours());
  const dayOfWeek = DAY_OF_WEEK[nowDate.getDay()] ?? 'sunday';

  const views = await listPageViews({
    since: daysAgo(LOOKBACK_DAYS, now),
    limit: MAX_VIEWS,
  });
  const sessions = bucketSessions(views);
  const matchingDurations = sessions
    .filter((s) => bucketHour(new Date(s.start).getHours()) === timeOfDay)
    .map((s) => s.end - s.start);

  const expectedSessionDurationMs = median(matchingDurations);
  const availableTime = bucketAvailableTime(expectedSessionDurationMs);

  return {
    timeOfDay,
    dayOfWeek,
    expectedSessionDurationMs,
    availableTime,
  };
}
