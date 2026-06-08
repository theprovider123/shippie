/**
 * Abuse-report reasons — a small closed set, shared by the report UI
 * (apps/[slug]) and the POST endpoint. Client-safe (no server imports).
 *
 * Shippie is intentionally open; these categories exist only to route
 * genuinely dangerous apps to admin review, not to police taste.
 */
export const REPORT_REASONS = [
  { value: 'malware', label: 'Malware or harmful code' },
  { value: 'abuse', label: 'Abusive or harmful content' },
  { value: 'impersonation', label: 'Impersonation or scam' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

const REASON_SET = new Set<string>(REPORT_REASONS.map((r) => r.value));

export const REPORT_DETAIL_MAX = 2000;

export function isValidReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && REASON_SET.has(value);
}

export interface NormalizedReport {
  reason: ReportReason;
  detail: string | null;
}

/**
 * Validate + normalize a raw report submission. Pure (no IO) so it's
 * unit-testable and reusable client + server side. Returns null on an
 * invalid reason — the caller turns that into a 400.
 */
export function normalizeReportInput(raw: { reason?: unknown; detail?: unknown }): NormalizedReport | null {
  if (!isValidReportReason(raw.reason)) return null;
  const detailRaw = typeof raw.detail === 'string' ? raw.detail.trim() : '';
  const detail = detailRaw ? detailRaw.slice(0, REPORT_DETAIL_MAX) : null;
  return { reason: raw.reason, detail };
}
