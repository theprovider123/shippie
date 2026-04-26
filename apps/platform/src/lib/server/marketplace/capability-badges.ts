/**
 * Capability badges — port of `apps/web/lib/shippie/capability-badges.ts`.
 *
 * Reads the autopackaging report attached to a deploy and picks the
 * badges the maker page should surface. The badge list is capped at 5,
 * "Works Offline" is hidden when its status is `warn` (the autopackager
 * emits warn when offline behaviour wasn't tested — showing a yellow
 * dot for an unverified capability is exactly the dishonesty the honesty
 * pass cuts out elsewhere).
 *
 * Phase 4a does NOT wire `ProvenCapabilities` overlays (that depends on
 * the app_events spine, which is Phase 4b/5 scope). The shape of the
 * output is forward-compatible: callers that pass a `proven` argument
 * later get the same return type with `proven: true` set on entries.
 */

export interface PublicCapabilityBadge {
  label: string;
  status: 'pass' | 'not_tested' | 'warn';
  proven?: boolean;
}

interface RawBadge {
  label?: unknown;
  status?: unknown;
}

export function publicCapabilityBadges(report: unknown): PublicCapabilityBadge[] {
  const raw = readBadges(report);
  return raw
    .filter((b): b is { label: string; status: PublicCapabilityBadge['status'] } => {
      return (
        typeof b.label === 'string' &&
        (b.status === 'pass' || b.status === 'not_tested' || b.status === 'warn')
      );
    })
    .filter((b) => b.status !== 'warn' || b.label !== 'Works Offline')
    .map((b) => ({ label: b.label, status: b.status }))
    .slice(0, 5);
}

function readBadges(report: unknown): RawBadge[] {
  if (!report || typeof report !== 'object') return [];
  const wrapper =
    'wrapper_compat' in report
      ? (report as { wrapper_compat?: unknown }).wrapper_compat
      : report;
  if (!wrapper || typeof wrapper !== 'object') return [];
  const badges = (wrapper as { capability_badges?: unknown }).capability_badges;
  return Array.isArray(badges) ? badges : [];
}
