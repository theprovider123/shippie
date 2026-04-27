/**
 * Privacy grade — A+ → F — derived from a PrivacyAuditReport.
 *
 * Per Phase 4 Stage A: maker-facing only. Promoted to user-facing trust
 * card / marketplace badge in Stage B once the scanner has proven itself.
 *
 * Grading rubric (master plan):
 *   A+  No data leaves the device. No tracking.
 *   A   Minimal external (declared feature data only). No tracking.
 *   B   External feature data + cdn fonts/scripts. No tracking.
 *   C   External API calls + at least one undeclared (unknown) host.
 *   F   Tracking beacons, analytics, data exfiltration patterns.
 *
 * The decision is rule-based, not weighted. Every grade has a single
 * sentence reason the maker can read and the trust card can render.
 */

import type { PrivacyAuditReport } from './privacy-audit.ts';

export type PrivacyGrade = 'A+' | 'A' | 'B' | 'C' | 'F';

export interface PrivacyGradeResult {
  grade: PrivacyGrade;
  /** One-sentence reason. Stable string format — the trust card uses it verbatim. */
  reason: string;
  /** Counts copied from the audit so the dashboard can render context. */
  counts: PrivacyAuditReport['counts'];
}

/**
 * Decide the grade. Order matters — the first matching rule wins.
 */
export function computePrivacyGrade(report: PrivacyAuditReport): PrivacyGradeResult {
  const c = report.counts;

  // Trackers always force F. Even one Google Analytics beacon means the
  // maker is shipping invasive third-party data flow on first load —
  // it's not graceful degradation, it's the default behavior.
  if (c.tracker > 0) {
    return {
      grade: 'F',
      reason: `${c.tracker} third-party tracker${c.tracker === 1 ? '' : 's'} detected — Shippie's privacy beacons replace these without sending data off device.`,
      counts: c,
    };
  }

  // Unknown hosts are a yellow flag — could be feature data the maker
  // forgot to declare in shippie.json, or could be exfiltration. C
  // until they declare or remove.
  if (c.unknown > 0) {
    return {
      grade: 'C',
      reason: `${c.unknown} undeclared external host${c.unknown === 1 ? '' : 's'} — declare in shippie.json's allowed_connect_domains or remove if unused.`,
      counts: c,
    };
  }

  // Feature data is fine but counts as external traffic.
  if (c.feature > 0) {
    return {
      grade: 'B',
      reason: `${c.feature} declared external feature host${c.feature === 1 ? '' : 's'} — works offline with cached data.`,
      counts: c,
    };
  }

  // Only CDN references (fonts, libs). The deploy pipeline can self-host
  // these in a later phase; B grade reflects the current state.
  if (c.cdn > 0) {
    return {
      grade: 'A',
      reason: `${c.cdn} CDN reference${c.cdn === 1 ? '' : 's'} (fonts/libs) — no user data leaves the device.`,
      counts: c,
    };
  }

  // Self-host + Shippie infra only (or nothing). Gold standard.
  return {
    grade: 'A+',
    reason: 'No external network use detected. Everything stays on the device.',
    counts: c,
  };
}
