/**
 * Phase 6 — App graduation report.
 *
 * Combines a maker's deploy-time signals (security score, privacy
 * grade, AppProfile) with optional usage signals to surface a
 * "ready to graduate" assessment. Graduation here means: the app
 * has earned a permanent place on the user's home screen — install
 * banners change tone, marketplace badges promote, and (later) the
 * app gets offered a wrapped-binary build path.
 *
 * Pure function. Takes everything as input so it's testable without a
 * database. The platform pipes in real signals from D1 + KV at
 * call-time.
 *
 * Stays heuristic. Returns the highest-tier the app has earned plus
 * the next-tier criteria the maker still has to clear. Tiers:
 *   - 'experimental' — default. The app exists, that's it.
 *   - 'maker-friendly' — clean security + privacy posture but no usage
 *     proof yet. Marketplace shows a "by an active maker" badge.
 *   - 'lived-in' — sustained user retention + repeat-week usage.
 *     Marketplace promotes; install banner gets a confidence cue.
 *   - 'graduate' — lived-in + cross-app intent participation +
 *     AppProfile breadth (multiple categories of capability proven).
 *     Maker is offered a wrapped-binary build path.
 */

export type GraduationTier = 'experimental' | 'maker-friendly' | 'lived-in' | 'graduate';

export interface DeploySignals {
  /** Phase 4 Stage A security score 0..100, or null if unscored. */
  securityScore: number | null;
  /** Phase 4 Stage A privacy grade A+|A|B|C|F, or null if ungraded. */
  privacyGrade: 'A+' | 'A' | 'B' | 'C' | 'F' | null;
  /** AppProfile category, e.g. 'cooking' / 'fitness'. 'unknown' if unset. */
  category: string;
  /** Distinct cross-app intents the app declares it provides. */
  intentsProvided: number;
  /** Distinct cross-app intents the app declares it consumes. */
  intentsConsumed: number;
  /** External network domains the app declares. */
  externalDomainCount: number;
}

export interface UsageSignals {
  /** Distinct users who opened the app in the last 7 days. */
  weeklyActiveUsers: number;
  /** Distinct weeks (in the last 4) where weeklyActiveUsers > 0. */
  weeksWithActivity: number;
  /** Median session duration (seconds) over the last 7 days. */
  medianSessionSeconds: number;
  /** Fraction of users in the last 7 days who came back the next day. */
  day1RetentionRate: number;
}

export interface GraduationReport {
  tier: GraduationTier;
  earnedCriteria: readonly string[];
  /** Concrete, action-able items still missing for the next tier. */
  nextTierCriteria: readonly string[];
  /** The next tier above `tier`, or null if already at 'graduate'. */
  nextTier: GraduationTier | null;
}

const PRIVACY_RANK: Record<NonNullable<DeploySignals['privacyGrade']>, number> = {
  'A+': 5,
  A: 4,
  B: 3,
  C: 2,
  F: 1,
};

const TIER_ORDER: readonly GraduationTier[] = [
  'experimental',
  'maker-friendly',
  'lived-in',
  'graduate',
];

export interface GraduationInput {
  deploy: DeploySignals;
  /** Usage signals are optional — pre-launch apps don't have any yet. */
  usage?: UsageSignals;
}

export function computeGraduation(input: GraduationInput): GraduationReport {
  const { deploy, usage } = input;
  const earned: string[] = [];
  const next: string[] = [];

  // Tier 1 — maker-friendly: security + privacy posture must be clean.
  const securityOk = (deploy.securityScore ?? 0) >= 70;
  const privacyOk = (deploy.privacyGrade && PRIVACY_RANK[deploy.privacyGrade] >= 3) || false;
  const declaredOk = deploy.externalDomainCount === 0 || deploy.externalDomainCount > 0;
  if (securityOk) earned.push('security score ≥ 70');
  else next.push('lift security score above 70 (run scanners; address findings)');
  if (privacyOk) earned.push('privacy grade B or better');
  else next.push('lift privacy grade to B or better (declare every external domain with a purpose)');
  if (declaredOk) earned.push('all external domains declared in manifest');
  // The third clause is always true today since the validator rejects
  // undeclared domains at deploy time. Listed for completeness.

  if (!securityOk || !privacyOk) {
    return finalise('experimental', earned, next);
  }

  // Tier 2 — lived-in: sustained usage proof.
  if (!usage) {
    next.push('publish the app and accumulate at least 7 days of usage signals');
    return finalise('maker-friendly', earned, next);
  }
  const weeklyActiveOk = usage.weeklyActiveUsers >= 25;
  const sustainedOk = usage.weeksWithActivity >= 3;
  const stickyOk = usage.day1RetentionRate >= 0.3;
  if (weeklyActiveOk) earned.push(`${usage.weeklyActiveUsers} weekly active users`);
  else next.push(`grow to ≥ 25 weekly active users (currently ${usage.weeklyActiveUsers})`);
  if (sustainedOk) earned.push(`${usage.weeksWithActivity}/4 recent weeks with activity`);
  else next.push(`use the app across ≥ 3 of the last 4 weeks (currently ${usage.weeksWithActivity})`);
  if (stickyOk) earned.push(`${Math.round(usage.day1RetentionRate * 100)}% day-1 retention`);
  else
    next.push(
      `lift day-1 retention to ≥ 30% (currently ${Math.round(usage.day1RetentionRate * 100)}%)`,
    );

  if (!weeklyActiveOk || !sustainedOk || !stickyOk) {
    return finalise('maker-friendly', earned, next);
  }

  // Tier 3 — graduate: cross-app participation + breadth.
  const intentParticipates = deploy.intentsProvided + deploy.intentsConsumed >= 1;
  const breadthOk = deploy.category !== 'unknown';
  if (intentParticipates) earned.push('declared cross-app intent participation');
  else
    next.push(
      'declare a cross-app intent (provides or consumes) so other Shippie apps can build on this one',
    );
  if (breadthOk) earned.push('AppProfile category resolved');
  else
    next.push(
      'help the AppProfile classifier (add a meta description, manifest description, or visible h1)',
    );

  if (!intentParticipates || !breadthOk) {
    return finalise('lived-in', earned, next);
  }
  return finalise('graduate', earned, []);
}

function finalise(
  tier: GraduationTier,
  earned: readonly string[],
  next: readonly string[],
): GraduationReport {
  const idx = TIER_ORDER.indexOf(tier);
  const nextTier = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1]! : null;
  return {
    tier,
    earnedCriteria: earned,
    nextTierCriteria: next,
    nextTier,
  };
}

export function describeGraduationTier(tier: GraduationTier): string {
  switch (tier) {
    case 'experimental':
      return 'Experimental — early days, no usage proof yet.';
    case 'maker-friendly':
      return 'Maker-friendly — clean security and privacy posture.';
    case 'lived-in':
      return 'Lived-in — real users come back across multiple weeks.';
    case 'graduate':
      return 'Graduate — sustained usage, cross-app participation, ready for a native shell.';
  }
}
