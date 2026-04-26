/**
 * Honesty pass — sanitises app metadata before render.
 *
 * The first marketplace iteration showed:
 *   - 5/5 stars on every app (a "compatibility score" we'd auto-set to 5)
 *   - A "V2" tech badge that wasn't even a feature flag
 *   - Permission checkmarks ("✓ Talks to Stripe") that were echoed from
 *     the app's autopackaging report unchecked
 *   - An "external domains" UX with no enforcement behind it
 *
 * The honesty pass cuts all four. Two reasons:
 *   1. None of those signals were grounded in real measurement.
 *   2. Showing them implies a guarantee we don't ship.
 *
 * What survives: real upvote / install counts (denormalised but accurate),
 * the maker-supplied tagline, the actual deploy timestamp, and capability
 * badges that are only shown if the autopackager observed the capability.
 */

export interface HonestApp {
  showCompatibilityScore: boolean;
  showTechBadge: boolean;
  showExternalDomains: boolean;
}

/**
 * Apply the honesty pass to an app card / detail context. Today the rule
 * is uniform: hide all three. The signature exists so callers don't have
 * to inline the logic — and so we can flip a per-app exception in future
 * (e.g. official Shippie apps that DO have audited compat scores) without
 * touching every page.
 */
export function honestyFor(_app: { compatibilityScore?: number | null }): HonestApp {
  return {
    showCompatibilityScore: false,
    showTechBadge: false,
    showExternalDomains: false,
  };
}

/**
 * Permissions display: read the app_permissions row and translate to
 * human-readable strings. Hide if no permissions are granted (some apps
 * declare no surface beyond the wrapper itself). Used by the detail page.
 */
export function describeGrantedPermissions(p: {
  auth?: boolean | null;
  storage?: string | null;
  files?: boolean | null;
  notifications?: boolean | null;
  externalNetwork?: boolean | null;
} | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.auth) out.push('Sign you in');
  if ((p.storage ?? 'none') !== 'none') out.push('Save your data');
  if (p.files) out.push('Accept file uploads');
  if (p.notifications) out.push('Send notifications');
  if (p.externalNetwork) out.push('Talk to external services');
  return out;
}
