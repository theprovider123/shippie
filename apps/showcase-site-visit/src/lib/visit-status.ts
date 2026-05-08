/**
 * Visit lifecycle. A visit moves through:
 *
 *   in-progress → submitted → amended
 *
 * "amended" means the inspector reopened a submitted visit to add a
 * correction. Submission is gated: a visit needs at least
 * MIN_COMPLETION_RATIO of its checks set to a non-pending status before
 * the submit button unlocks. This prevents a half-finished walk-through
 * being signed off by accident.
 */

import type { Check, CheckStatus, Visit, VisitStatus } from '../db/schema.ts';

/** Inspector must have called pass/fail/na/needs-attention on this fraction. */
export const MIN_COMPLETION_RATIO = 0.8;

export const TERMINAL_CHECK_STATUSES: ReadonlySet<CheckStatus> = new Set([
  'pass',
  'fail',
  'na',
  'needs-attention',
]);

export interface CompletionSummary {
  total: number;
  done: number;
  ratio: number;
  meetsThreshold: boolean;
}

export function summariseCompletion(checks: ReadonlyArray<Check>): CompletionSummary {
  const total = checks.length;
  if (total === 0) {
    return { total: 0, done: 0, ratio: 0, meetsThreshold: false };
  }
  const done = checks.filter((c) => TERMINAL_CHECK_STATUSES.has(c.status)).length;
  const ratio = done / total;
  return {
    total,
    done,
    ratio,
    meetsThreshold: ratio >= MIN_COMPLETION_RATIO,
  };
}

export interface SubmitGate {
  canSubmit: boolean;
  reason: string | null;
}

export function canSubmit(visit: Visit, checks: ReadonlyArray<Check>): SubmitGate {
  if (visit.status === 'submitted') {
    return { canSubmit: false, reason: 'Already submitted. Reopen to amend.' };
  }
  if (checks.length === 0) {
    return { canSubmit: false, reason: 'Add at least one check.' };
  }
  const summary = summariseCompletion(checks);
  if (!summary.meetsThreshold) {
    const pct = Math.round(MIN_COMPLETION_RATIO * 100);
    return {
      canSubmit: false,
      reason: `${summary.done} of ${summary.total} checked — need ${pct}%.`,
    };
  }
  if (!visit.signature_svg || visit.signature_svg.length < 8) {
    return { canSubmit: false, reason: 'Sign before submitting.' };
  }
  return { canSubmit: true, reason: null };
}

export function nextStatus(current: VisitStatus, action: 'submit' | 'reopen'): VisitStatus {
  if (action === 'submit') {
    if (current === 'in-progress') return 'submitted';
    if (current === 'amended') return 'submitted';
    return current;
  }
  // reopen
  if (current === 'submitted') return 'amended';
  return current;
}

/**
 * True if the visit has a hard fail or "needs attention" finding —
 * surface this on cards so a half-checked-but-fine visit doesn't look
 * the same as one with an open issue.
 */
export function hasOpenIssues(checks: ReadonlyArray<Check>): boolean {
  return checks.some((c) => c.status === 'fail' || c.status === 'needs-attention');
}
