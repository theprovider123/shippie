/**
 * Training load — turns raw logged sets into the one number coaches
 * actually track: are you ramping productively, or digging a hole?
 *
 * We use the acute:chronic workload ratio (ACWR), the sports-science
 * staple: this week's load against your rolling 4-week average week.
 *   - 0.8–1.3  → the productive "sweet spot"
 *   - > 1.5    → overreaching; injury risk climbs
 *   - < 0.8    → detraining / coming back from a layoff
 *
 * Session load is sRPE-style: tonnage scaled by effort when RPE is
 * present, plain tonnage when it isn't. Everything is pure and takes an
 * injectable `now`, so the ratio is deterministic under test.
 *
 * This feeds the `training-load-updated` intent so other Shippie apps
 * (a recovery dashboard, the cycle tracker) can react — and feeds Lift's
 * own deload prompt. The number is computed on-device from local sets.
 */
import type { SetRow } from '../db/schema.ts';

export type LoadBand = 'detraining' | 'maintaining' | 'productive' | 'overreaching';

export interface TrainingLoad {
  /** Σ weight × reps for the session's working sets. */
  sessionTonnage: number;
  /** Effort-scaled session load (sRPE-style); equals tonnage with no RPE. */
  sessionLoad: number;
  /** Working-set tonnage in the trailing 7 days. */
  acuteTonnage: number;
  /** Average weekly working-set tonnage over the trailing 28 days. */
  chronicWeeklyTonnage: number;
  /** acute : chronic workload ratio, or null when there's no chronic base. */
  acwr: number | null;
  band: LoadBand;
  recommendDeload: boolean;
  reason: string;
  /** False when there isn't enough history for an honest ratio. */
  honest: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ACUTE_WINDOW = WEEK_MS;
const CHRONIC_WINDOW = 4 * WEEK_MS;
const OVERREACH = 1.5;
const SWEET_LOW = 0.8;
const SWEET_HIGH = 1.3;

export function computeTrainingLoad(input: {
  /** All historical working sets (the just-finished session can be included). */
  workingSets: readonly SetRow[];
  /** The sets that belong to the session that just finished. */
  sessionSets?: readonly SetRow[];
  now?: number;
}): TrainingLoad {
  const now = input.now ?? Date.now();
  const session = (input.sessionSets ?? []).filter((s) => s.set_type === 'working');

  const sessionTonnage = tonnage(session);
  const sessionLoad = session.reduce((acc, s) => {
    const effort = typeof s.rpe === 'number' && s.rpe > 0 ? s.rpe / 10 : 1;
    return acc + s.weight * s.reps * effort;
  }, 0);

  const acuteFloor = now - ACUTE_WINDOW;
  const chronicFloor = now - CHRONIC_WINDOW;
  let acuteTonnage = 0;
  let chronicTonnage = 0;
  for (const s of input.workingSets) {
    if (s.set_type !== 'working') continue;
    const t = Date.parse(s.completed_at);
    if (Number.isNaN(t) || t > now) continue;
    if (t >= acuteFloor) acuteTonnage += s.weight * s.reps;
    if (t >= chronicFloor) chronicTonnage += s.weight * s.reps;
  }
  const chronicWeeklyTonnage = chronicTonnage / 4;

  if (chronicWeeklyTonnage === 0) {
    return {
      sessionTonnage: Math.round(sessionTonnage),
      sessionLoad: Math.round(sessionLoad),
      acuteTonnage: Math.round(acuteTonnage),
      chronicWeeklyTonnage: 0,
      acwr: null,
      band: 'maintaining',
      recommendDeload: false,
      reason: 'Not enough history for a load ratio yet. Keep logging.',
      honest: false,
    };
  }

  const acwr = acuteTonnage / chronicWeeklyTonnage;
  const rounded = Math.round(acwr * 100) / 100;
  let band: LoadBand;
  let reason: string;
  let recommendDeload = false;

  if (acwr > OVERREACH) {
    band = 'overreaching';
    reason = `This week is ${rounded}× your 4-week average. Overreaching — a deload protects the gains.`;
    recommendDeload = true;
  } else if (acwr >= SWEET_LOW && acwr <= SWEET_HIGH) {
    band = 'productive';
    reason = `Load ratio ${rounded}× — squarely in the productive zone.`;
  } else if (acwr < SWEET_LOW) {
    band = 'detraining';
    reason = `Load ratio ${rounded}× — below maintenance. Room to push if you're fresh.`;
  } else {
    band = 'maintaining';
    reason = `Load ratio ${rounded}× — slightly elevated but manageable.`;
  }

  return {
    sessionTonnage: Math.round(sessionTonnage),
    sessionLoad: Math.round(sessionLoad),
    acuteTonnage: Math.round(acuteTonnage),
    chronicWeeklyTonnage: Math.round(chronicWeeklyTonnage),
    acwr: rounded,
    band,
    recommendDeload,
    reason,
    honest: true,
  };
}

function tonnage(sets: readonly SetRow[]): number {
  return sets.reduce((acc, s) => acc + s.weight * s.reps, 0);
}
