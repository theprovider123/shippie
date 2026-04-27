/**
 * Security score (0-100) computed from a SecurityScanReport.
 *
 * Per the master plan Phase 4 Stage A: the score is computed but stays
 * **maker-facing only** until the scanner has high coverage and low
 * false-positive rate. We compute now to tune weights against real
 * deploys; promotion to public surface is deferred to Stage B.
 *
 * The score is *explainable*: every deduction is tied to a specific
 * finding rule. The maker sees "−25 because we found a hardcoded AWS
 * access key" not just "your score is 75".
 *
 * Weights are deliberately small at first — we'd rather under-score a
 * problem and revise upward than over-score early and erode trust.
 */

import type {
  SecurityFinding,
  SecurityScanReport,
  SecurityRuleId,
} from './security-scan.ts';

export interface SecurityDeduction {
  rule: SecurityRuleId;
  /** Negative value applied to the base 100. */
  delta: number;
  /** Plain-English reason. Same string format as the trust-card copy. */
  reason: string;
  /** How many findings of this rule contributed (deduction is per-occurrence). */
  count: number;
}

export interface SecurityScore {
  /** 0–100. Higher is better. */
  value: number;
  /** Each deduction with reason + delta. Sums (+ base 100) reproduce `value`. */
  deductions: SecurityDeduction[];
  /** Number of `block`-severity findings — even one means the deploy
   *  pipeline COULD have blocked the deploy in Phase 4 Stage B mode.
   *  Today (Stage A) blocks are surfaced but never block the deploy. */
  blocks: number;
}

/**
 * Per-rule deduction weights. Conservative — these are the maker-facing
 * numbers, and inflated penalties would just train makers to tune them
 * out. We keep blocks heavy and warns light.
 *
 * Stages:
 *   - block-severity rules: -25 to -30 each (anything above 1 occurrence
 *     is independently bad; we cap counted occurrences at 3 to avoid
 *     score inflation from a single key showing up across many bundles)
 *   - warn-severity rules: -8 to -12
 *   - info-severity rules: -2 to -4
 */
const RULE_WEIGHTS: Record<SecurityRuleId, { delta: number; reason: string }> = {
  secret_aws_access_key: {
    delta: -30,
    reason: 'AWS access key in client bundle — rotate and move server-side',
  },
  secret_stripe_key: {
    delta: -30,
    reason: 'Stripe secret key in client bundle — rotate immediately',
  },
  secret_github_token: {
    delta: -25,
    reason: 'GitHub PAT in client bundle — rotate immediately',
  },
  secret_openai_key: {
    delta: -25,
    reason: 'OpenAI/Anthropic-style API key in client bundle — rotate, run inference locally',
  },
  secret_supabase_anon: {
    delta: -10,
    reason: 'Supabase/JWT-shaped token in bundle — local-first apps usually do not need keys',
  },
  secret_jwt: {
    delta: -10,
    reason: 'JWT-shaped credential in bundle — review whether it should be server-side',
  },
  secret_firebase_apikey: {
    delta: -8,
    reason: 'Firebase API key in bundle — scope it in GCP console (HTTP referrer + API restrict)',
  },
  external_script_unknown_host: {
    delta: -8,
    reason: 'External script from non-allowlisted host — self-host or remove',
  },
  mixed_content: {
    delta: -5,
    reason: 'Insecure (http://) resource — browsers block on https pages; auto-fix where possible',
  },
  javascript_uri: {
    delta: -8,
    reason: 'javascript: URI in href/src — replace with event listener',
  },
  inline_event_handler: {
    delta: -2,
    reason: 'Inline event handlers block CSP nonce hardening',
  },
};

/** Cap on how many occurrences of a single rule can stack. Stops one
 *  bundled secret repeated across chunks from sinking the score. */
const MAX_OCCURRENCES_PER_RULE = 3;

export function computeSecurityScore(report: SecurityScanReport): SecurityScore {
  const counts = countByRule(report.findings);
  let value = 100;
  const deductions: SecurityDeduction[] = [];

  for (const [rule, raw] of counts) {
    const weights = RULE_WEIGHTS[rule];
    if (!weights) continue;
    const count = Math.min(raw, MAX_OCCURRENCES_PER_RULE);
    const delta = weights.delta * count;
    value += delta;
    deductions.push({
      rule,
      delta,
      reason: weights.reason,
      count: raw,
    });
  }

  // Floor at 0; a perfect bundle stays at 100. We deliberately don't
  // award above 100 — leaves room for future positive signals (proof
  // events showing real-world local-first behavior) without re-scaling.
  if (value < 0) value = 0;
  if (value > 100) value = 100;

  return {
    value,
    deductions,
    blocks: report.blocks,
  };
}

function countByRule(findings: SecurityFinding[]): Map<SecurityRuleId, number> {
  const m = new Map<SecurityRuleId, number>();
  for (const f of findings) {
    m.set(f.rule, (m.get(f.rule) ?? 0) + 1);
  }
  return m;
}
