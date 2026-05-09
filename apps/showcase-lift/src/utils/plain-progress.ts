/**
 * Plain-language progression summaries.
 *
 * Honesty first: when data is sparse, this returns "No clear trend yet —
 * log N more sessions" rather than fabricating a story.
 *
 * Sufficiency thresholds (calibrated to be conservative, not punchy):
 *   - <2 working sessions for the lift  → "no clear trend yet"
 *   - 2 sessions, ≤ 14 days apart       → "first session vs today"
 *   - 3+ sessions across ≥ 14 days      → richer summaries enabled
 *
 * Examples:
 *   "+3 reps at 80kg in 8 weeks"          (constant weight, more reps)
 *   "Same reps, +5kg since March 12"      (constant reps, more weight)
 *   "Best 5-rep set improved from 90kg to 97.5kg"
 *   "Volume up 18% over 4 weeks"
 *   "No clear trend yet. Log 2 more sessions."
 */
import type { SetRow, Unit } from '../db/schema.ts';
import { repRange } from './pr-detect.ts';

export interface ProgressSummary {
  /** Plain-language headline. Always present. */
  headline: string;
  /** Whether enough data exists to draw a real trend. */
  honest: boolean;
}

interface ProgressInput {
  /** Variant-scoped working sets, ordered or not. */
  workingSets: readonly SetRow[];
  /** Display unit for the headline. */
  unit: Unit;
  /** Reference clock; defaults to Date.now(). Useful for tests. */
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildProgressSummary(input: ProgressInput): ProgressSummary {
  const { unit } = input;
  const now = input.now ?? Date.now();
  const sets = [...input.workingSets].sort(
    (a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
  );
  if (sets.length < 2) {
    return {
      headline: 'No clear trend yet. Log 2 more sessions.',
      honest: true,
    };
  }

  // Group by session-day to compute "session count."
  const days = new Set<string>();
  for (const s of sets) days.add(s.completed_at.slice(0, 10));
  const sessionCount = days.size;

  if (sessionCount < 2) {
    return {
      headline: 'No clear trend yet. Log 2 more sessions.',
      honest: true,
    };
  }

  const first = sets[0]!;
  const last = sets[sets.length - 1]!;
  const spanDays = Math.max(
    1,
    Math.round((Date.parse(last.completed_at) - Date.parse(first.completed_at)) / DAY_MS),
  );
  const spanLabel = formatSpan(spanDays);

  // Plain comparisons against the very first session.
  if (Math.abs(last.weight - first.weight) < 0.001 && last.reps > first.reps) {
    const delta = last.reps - first.reps;
    return {
      headline: `+${delta} ${plural(delta, 'rep', 'reps')} at ${formatWeight(last.weight)}${unit} in ${spanLabel}`,
      honest: true,
    };
  }
  if (last.weight > first.weight && last.reps === first.reps) {
    const delta = +(last.weight - first.weight).toFixed(2);
    return {
      headline: `Same reps, +${formatWeight(delta)}${unit} since ${formatDate(first.completed_at, now)}`,
      honest: true,
    };
  }

  // Best within the latest rep bucket — improvement headline.
  const topRange = repRange(last.reps);
  const inRange = sets.filter((s) => repRange(s.reps) === topRange);
  if (inRange.length >= 2) {
    const earliestInRange = inRange[0]!;
    const bestInRange = best(inRange);
    if (bestInRange && earliestInRange !== bestInRange && bestInRange.weight > earliestInRange.weight) {
      return {
        headline: `Best ${bestInRange.reps}-rep set improved from ${formatWeight(earliestInRange.weight)}${unit} to ${formatWeight(bestInRange.weight)}${unit}`,
        honest: true,
      };
    }
  }

  // Volume change (sum of weight × reps) across the span.
  if (sessionCount >= 3 && spanDays >= 14) {
    const half = spanDays / 2;
    const splitTs = Date.parse(first.completed_at) + half * DAY_MS;
    const earlyVolume = sets
      .filter((s) => Date.parse(s.completed_at) < splitTs)
      .reduce((sum, s) => sum + s.weight * s.reps, 0);
    const lateVolume = sets
      .filter((s) => Date.parse(s.completed_at) >= splitTs)
      .reduce((sum, s) => sum + s.weight * s.reps, 0);
    if (earlyVolume > 0 && lateVolume > 0) {
      const pct = Math.round(((lateVolume - earlyVolume) / earlyVolume) * 100);
      const sign = pct > 0 ? '+' : '';
      return {
        headline: `Volume ${pct >= 0 ? 'up' : 'down'} ${sign}${pct}% over ${spanLabel}`,
        honest: true,
      };
    }
  }

  // Fallback — honest about not having a clean story.
  return {
    headline: `${sessionCount} sessions logged over ${spanLabel}. Pattern still emerging.`,
    honest: true,
  };
}

function best(sets: readonly SetRow[]): SetRow | null {
  return sets.reduce<SetRow | null>((acc, s) => {
    if (!acc) return s;
    if (s.weight > acc.weight) return s;
    if (s.weight === acc.weight && s.reps > acc.reps) return s;
    return acc;
  }, null);
}

function plural(n: number, single: string, many: string): string {
  return n === 1 ? single : many;
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, '');
}

function formatSpan(days: number): string {
  if (days < 14) return `${days} ${plural(days, 'day', 'days')}`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks} ${plural(weeks, 'week', 'weeks')}`;
  const months = Math.round(days / 30);
  return `${months} ${plural(months, 'month', 'months')}`;
}

function formatDate(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
