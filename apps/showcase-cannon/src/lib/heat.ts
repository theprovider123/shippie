import type { Heat, Take } from './types';

/**
 * Heat is earned, not declared: derived from upvotes so fresh takes start
 * cold and climb. Thresholds are sized for a real fan community (tens of
 * voters), not the demo's fictional thousands — 10 nods is warm, 50 is
 * scorching. The historic seed takes carry launch-era counts and read
 * scorching, which is exactly right for the all-time bangers they are.
 */
export function heatFor(up: number): Heat {
  if (up >= 50) return 'scorching';
  if (up >= 10) return 'warm';
  return 'cold';
}

/** Cards with a majority of downvotes dim — community moderation. */
export function isDimmed(take: Pick<Take, 'up' | 'down'>): boolean {
  return take.down / (take.up + take.down + 1) > 0.55;
}

/** Relative timestamp in the design's compact format (now/5m/2h/3d). */
export function timeAgo(createdAt: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
