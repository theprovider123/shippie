/**
 * Read-time estimation. Default 240 wpm — Pew + Medium converge in
 * the 230-260 range for casual reading; 240 lets us round to nice
 * numbers without overstating speed for technical content.
 */

export const READING_WPM = 240;

export function estimateMinutes(wordCount: number, wpm: number = READING_WPM): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 1;
  return Math.max(1, Math.round(wordCount / wpm));
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Format a read-time as "5 min read" / "1 min read". */
export function formatReadTime(minutes: number): string {
  const safe = Math.max(1, Math.round(minutes));
  return `${safe} min read`;
}

/**
 * "How much have I got left?" copy. Given progress 0..1 and the
 * total minutes, return e.g. "3 min left" or "" when nothing is
 * meaningful (progress too low or basically done).
 */
export function formatRemaining(progress: number, totalMinutes: number): string {
  if (!Number.isFinite(progress) || progress <= 0.05) return '';
  if (progress >= 0.95) return 'Done';
  const remaining = Math.max(1, Math.round(totalMinutes * (1 - progress)));
  return `${remaining} min left`;
}
