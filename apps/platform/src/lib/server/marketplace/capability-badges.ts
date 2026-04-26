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
 *
 * `publicCapabilityBadgesFromProfile` augments the autopack-derived
 * badges with deploy-time signals from `@shippie/analyse`'s AppProfile
 * (read from `apps:{slug}:profile` in KV). This is the "real
 * auto-detected capabilities vs the seed compatibility data" wiring
 * called out in the intelligence-layer handoff.
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

/**
 * Profile-shaped badges — derived from the @shippie/analyse AppProfile
 * stored at `apps:{slug}:profile`. Structural typing keeps this module
 * decoupled from the analyser package.
 */
interface AppProfileLite {
  framework?: { hasServiceWorker?: boolean } | null;
  recommended?: { ai?: readonly string[] | false; enhance?: Record<string, readonly string[]> } | null;
  wasm?: { detected?: boolean } | null;
}

export function badgesFromProfile(profile: unknown): PublicCapabilityBadge[] {
  if (!profile || typeof profile !== 'object') return [];
  const p = profile as AppProfileLite;
  const out: PublicCapabilityBadge[] = [];
  if (p.framework?.hasServiceWorker) {
    out.push({ label: 'Works Offline', status: 'pass' });
  }
  if (p.wasm?.detected) {
    out.push({ label: 'WASM-accelerated', status: 'pass' });
  }
  const ai = p.recommended?.ai;
  if (Array.isArray(ai) && ai.length > 0) {
    out.push({ label: 'Local AI', status: 'pass' });
  }
  return out;
}

/**
 * Combine autopack-derived badges with profile-derived badges. The
 * profile is the deploy-time analyser; the autopack report is the
 * legacy/seed source. Profile wins on label collisions (it's the truer
 * signal). Capped at 5, same as `publicCapabilityBadges`.
 */
export function publicCapabilityBadgesFromProfile(
  report: unknown,
  profile: unknown,
): PublicCapabilityBadge[] {
  const fromProfile = badgesFromProfile(profile);
  const fromReport = publicCapabilityBadges(report);
  const seen = new Set(fromProfile.map((b) => b.label));
  const merged = [...fromProfile];
  for (const b of fromReport) {
    if (seen.has(b.label)) continue;
    seen.add(b.label);
    merged.push(b);
  }
  return merged.slice(0, 5);
}
