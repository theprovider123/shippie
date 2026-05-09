/**
 * Strain check — flags when 4-week training ramp is too aggressive.
 *
 * Compares the last 4 weeks of working-set tonnage (Σ weight × reps) to
 * the 4 weeks before that. If the latest is >= 1.25× the prior, we
 * recommend a deload week. The threshold is conservative — we'd rather
 * miss a flag than fire one falsely.
 *
 * Returns honest "insufficient-data" results when there's < 4 weeks of
 * history. The Glance dashboard surfaces those as quiet hints.
 */
import type { SetRow } from '../db/schema.ts';

export interface StrainResult {
  /** Last 4 weeks tonnage (kg-equivalent — sum of weight × reps). */
  recentTonnage: number;
  /** 4 weeks before that. */
  priorTonnage: number;
  /** Ratio (recent / prior). null if prior is 0. */
  ratio: number | null;
  /** True when the deload threshold is exceeded. */
  recommendDeload: boolean;
  /** Reason text for the user. */
  reason: string;
  /** Whether we have enough data for a real comparison. */
  honest: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const RAMP_THRESHOLD = 1.25;

export function evaluateStrain(input: {
  workingSets: readonly SetRow[];
  now?: number;
}): StrainResult {
  const now = input.now ?? Date.now();
  const fourWeeksAgo = now - 4 * WEEK_MS;
  const eightWeeksAgo = now - 8 * WEEK_MS;

  const recent: SetRow[] = [];
  const prior: SetRow[] = [];
  for (const s of input.workingSets) {
    if (s.set_type !== 'working') continue;
    const t = Date.parse(s.completed_at);
    if (t >= fourWeeksAgo && t <= now) recent.push(s);
    else if (t >= eightWeeksAgo && t < fourWeeksAgo) prior.push(s);
  }

  const recentTonnage = sumTonnage(recent);
  const priorTonnage = sumTonnage(prior);

  if (priorTonnage === 0 && recentTonnage === 0) {
    return {
      recentTonnage,
      priorTonnage,
      ratio: null,
      recommendDeload: false,
      reason: 'No working sets in the last 8 weeks.',
      honest: false,
    };
  }
  if (priorTonnage === 0) {
    return {
      recentTonnage,
      priorTonnage: 0,
      ratio: null,
      recommendDeload: false,
      reason: 'Not enough history to flag overreach. Keep logging.',
      honest: false,
    };
  }

  const ratio = recentTonnage / priorTonnage;
  if (ratio >= RAMP_THRESHOLD) {
    const pct = Math.round((ratio - 1) * 100);
    return {
      recentTonnage,
      priorTonnage,
      ratio,
      recommendDeload: true,
      reason: `Volume up ${pct}% over 4 weeks. Consider a deload week.`,
      honest: true,
    };
  }
  if (ratio >= 1) {
    const pct = Math.round((ratio - 1) * 100);
    return {
      recentTonnage,
      priorTonnage,
      ratio,
      recommendDeload: false,
      reason: pct === 0 ? 'Volume steady over 4 weeks.' : `Volume up ${pct}% over 4 weeks.`,
      honest: true,
    };
  }
  const pct = Math.round((1 - ratio) * 100);
  return {
    recentTonnage,
    priorTonnage,
    ratio,
    recommendDeload: false,
    reason: `Volume down ${pct}% over 4 weeks.`,
    honest: true,
  };
}

function sumTonnage(sets: readonly SetRow[]): number {
  return sets.reduce((acc, s) => acc + s.weight * s.reps, 0);
}
