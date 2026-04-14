/**
 * Compliance result types.
 *
 * `needs_action` is distinct from `failed`: it blocks the readiness gate
 * the same way, but the UI renders an action card with a CTA instead of
 * an error card.
 *
 * See spec v6 §14.4.
 */
export const COMPLIANCE_STATUSES = [
  'passed',
  'failed',
  'pending',
  'not_applicable',
  'needs_action',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export type ComplianceResult =
  | { status: 'passed'; metadata?: Record<string, unknown> }
  | { status: 'failed'; reason: string; metadata?: Record<string, unknown> }
  | { status: 'pending'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | {
      status: 'needs_action';
      reason: string;
      cta: { key: string; payload?: Record<string, unknown> };
    };

export const pass = (metadata?: Record<string, unknown>): ComplianceResult => ({
  status: 'passed',
  metadata,
});

export const fail = (reason: string, metadata?: Record<string, unknown>): ComplianceResult => ({
  status: 'failed',
  reason,
  metadata,
});

export const pending = (reason: string): ComplianceResult => ({
  status: 'pending',
  reason,
});

export const notApplicable = (reason: string): ComplianceResult => ({
  status: 'not_applicable',
  reason,
});

export const needsAction = (
  reason: string,
  cta: { key: string; payload?: Record<string, unknown> },
): ComplianceResult => ({
  status: 'needs_action',
  reason,
  cta,
});

/**
 * The score gate treats needs_action and failed identically for blocking,
 * but the UI must render them differently. Use this helper to decide
 * whether a check counts as "blocking score ≥85".
 */
export const isBlockingResult = (r: ComplianceResult): boolean =>
  r.status === 'failed' || r.status === 'needs_action';
