// packages/sdk/src/wrapper/analytics.ts
/**
 * Privacy-first analytics beacon — Phase 6.1 of the master plan.
 *
 * Aggregate counts only. No personal content. No cross-app correlation.
 * No cross-day tracking. The maker gets useful product intelligence; the
 * user identity remains unrecoverable from any beacon Shippie ever stores.
 *
 * Privacy is enforced by a *schema allowlist* — every beacon is built
 * by copying named fields into a fresh object. Anything not on the
 * allowlist is dropped at serialization, regardless of input shape.
 * Per-master-plan Phase 6: this is the enforcement mechanism, not
 * a CI grep test.
 *
 * Forbidden fields the codec MUST strip even if they appear in the
 * pipeline that builds the beacon:
 *   - raw URL paths or query strings
 *   - search queries / form values / any user-typed content
 *   - persistent device identifiers (only the daily session hash is allowed)
 *   - geolocation
 *   - device fingerprint beyond a coarse class (high|mid|low)
 *   - timestamps with millisecond precision (only date or coarse minute)
 */

/** All allowed fields on a beacon. Adding a field here is a deliberate
 *  privacy decision, not an accident. */
export const ALLOWED_BEACON_FIELDS = [
  'appSlug',
  'period',
  'sessionHash',
  'metrics',
] as const;

export const ALLOWED_METRIC_FIELDS = [
  'sessions',
  'minutesActive',
  'pages',
  'actions',
  'performance',
  'cohort',
] as const;

export const ALLOWED_PERFORMANCE_FIELDS = ['loadTime', 'lcp', 'cls', 'inp'] as const;

export const ALLOWED_COHORT_FIELDS = ['installWeek', 'daysSinceInstall', 'isActive'] as const;

export type DeviceClass = 'high' | 'mid' | 'low';

export interface AnalyticsBeacon {
  appSlug: string;
  /** UTC date YYYY-MM-DD. Day-level resolution only. */
  period: string;
  /** Per-app per-day SHA-256 hash. Drives DAU; cannot be linked across days. */
  sessionHash: string;
  metrics: {
    sessions: number;
    minutesActive: number;
    /**
     * Page visit counts, parameterized routes only. Keys MUST be of the
     * form `/recipes/:id` not `/recipes/carbonara`. The codec validates
     * this — concrete IDs in keys are dropped.
     */
    pages: Record<string, number>;
    /**
     * Action counts. Keys MAY include parameterized variants
     * (`recipe-saved:cuisine=italian`). The codec strips any colon-
     * separated value that LOOKS like raw user content (long, contains
     * spaces, etc.) and keeps short categorical values only.
     */
    actions: Record<string, number>;
    /** Optional Web Vitals — coarse millisecond resolution. */
    performance?: {
      loadTime?: number;
      lcp?: number;
      cls?: number;
      inp?: number;
    };
    /** Cohort — install-week granularity, never per-day. */
    cohort?: {
      installWeek: string;
      daysSinceInstall: number;
      isActive: boolean;
    };
  };
}

export interface BuildBeaconInput {
  appSlug: string;
  /** UTC date string YYYY-MM-DD. */
  period: string;
  sessionHash: string;
  /** Inputs the codec strips through the allowlist. Pass anything; the
   *  output is guaranteed clean. */
  raw: Record<string, unknown>;
}

const ROUTE_SEGMENT_RE = /^[a-z][a-z0-9_-]{0,40}$/i;
const ROUTE_PLACEHOLDER_RE = /^:[a-z][a-z0-9_]{0,40}$/i;

function asNumber(v: unknown, opts: { min?: number; max?: number; round?: boolean } = {}): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  let n = v;
  if (opts.round) n = Math.round(n);
  if (opts.min !== undefined && n < opts.min) return undefined;
  if (opts.max !== undefined && n > opts.max) return undefined;
  return n;
}

function sanitizePageKey(key: string): string | null {
  // Allow these patterns and nothing else:
  //   "/"                              — root
  //   "/about"                         — single static segment
  //   "/recipes/:id"                   — at least one placeholder
  //   "/users/:id/edit"                — placeholder + tail
  // Reject:
  //   "/recipes/carbonara"             — multi-segment all-concrete (could be an ID)
  //   "/?q=secret"                     — query strings
  //   "/path#frag"                     — fragments
  //   "/page with space"               — anything off the strict alphabet
  if (typeof key !== 'string') return null;
  if (key.length > 128) return null;
  if (key.includes('?') || key.includes('#')) return null;
  if (key === '/') return key;
  if (!key.startsWith('/')) return null;
  // Trailing slash optional — strip for matching.
  const stripped = key.endsWith('/') && key.length > 1 ? key.slice(0, -1) : key;
  const segments = stripped.split('/').slice(1); // drop empty pre-first
  if (segments.length === 0) return null;
  let hasPlaceholder = false;
  for (const seg of segments) {
    if (ROUTE_PLACEHOLDER_RE.test(seg)) {
      hasPlaceholder = true;
      continue;
    }
    if (!ROUTE_SEGMENT_RE.test(seg)) return null;
  }
  // Single static segment is OK (top-level page like /about).
  // Multi-segment paths require at least one placeholder so we don't
  // accidentally accept concrete IDs like /recipes/carbonara.
  if (segments.length > 1 && !hasPlaceholder) return null;
  return key;
}

const ACTION_KEY_RE = /^[a-z][a-z0-9_-]{0,40}(?::[a-z_][a-z0-9_-]{0,30}=[a-z0-9_-]{1,30})*$/i;

function sanitizeActionKey(key: string): string | null {
  if (typeof key !== 'string') return null;
  if (key.length > 120) return null;
  // Action key may look like `recipe-saved` or `recipe-saved:cuisine=italian`.
  // We only allow short categorical values, never long free text.
  if (!ACTION_KEY_RE.test(key)) return null;
  // Reject anything that looks like a URL, search query, or contains
  // whitespace.
  if (/\s|https?:|@/.test(key)) return null;
  return key;
}

function sanitizeCounts(
  raw: unknown,
  sanitize: (k: string) => string | null,
): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const safeKey = sanitize(k);
    if (!safeKey) continue;
    const safeCount = asNumber(v, { min: 0, max: 1_000_000, round: true });
    if (safeCount === undefined) continue;
    out[safeKey] = safeCount;
  }
  return out;
}

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const SLUG_RE = /^[a-z0-9-]{1,63}$/;
const INSTALL_WEEK_RE = /^\d{4}-W\d{2}$/;

/**
 * Build an analytics beacon from raw pipeline data. The output is
 * guaranteed to contain only allowlisted fields.
 *
 * Returns null if a required field is malformed (so the caller can
 * skip the send rather than transmit garbage).
 */
export function buildBeacon(input: BuildBeaconInput): AnalyticsBeacon | null {
  if (!SLUG_RE.test(input.appSlug)) return null;
  if (!PERIOD_RE.test(input.period)) return null;
  if (!HASH_RE.test(input.sessionHash)) return null;

  const raw = input.raw ?? {};
  const rawMetrics = (raw.metrics as Record<string, unknown> | undefined) ?? {};

  const metrics: AnalyticsBeacon['metrics'] = {
    sessions: asNumber(rawMetrics.sessions, { min: 0, max: 1000, round: true }) ?? 0,
    minutesActive:
      asNumber(rawMetrics.minutesActive, { min: 0, max: 24 * 60, round: true }) ?? 0,
    pages: sanitizeCounts(rawMetrics.pages, sanitizePageKey),
    actions: sanitizeCounts(rawMetrics.actions, sanitizeActionKey),
  };

  const rawPerf = rawMetrics.performance as Record<string, unknown> | undefined;
  if (rawPerf) {
    const perf: NonNullable<AnalyticsBeacon['metrics']['performance']> = {};
    const lt = asNumber(rawPerf.loadTime, { min: 0, max: 60_000, round: true });
    const lcp = asNumber(rawPerf.lcp, { min: 0, max: 60_000, round: true });
    const cls = asNumber(rawPerf.cls, { min: 0, max: 5 });
    const inp = asNumber(rawPerf.inp, { min: 0, max: 60_000, round: true });
    if (lt !== undefined) perf.loadTime = lt;
    if (lcp !== undefined) perf.lcp = lcp;
    if (cls !== undefined) perf.cls = Number(cls.toFixed(3));
    if (inp !== undefined) perf.inp = inp;
    if (Object.keys(perf).length > 0) metrics.performance = perf;
  }

  const rawCohort = rawMetrics.cohort as Record<string, unknown> | undefined;
  if (rawCohort && typeof rawCohort.installWeek === 'string' && INSTALL_WEEK_RE.test(rawCohort.installWeek)) {
    const days = asNumber(rawCohort.daysSinceInstall, { min: 0, max: 3650, round: true });
    if (days !== undefined) {
      metrics.cohort = {
        installWeek: rawCohort.installWeek,
        daysSinceInstall: days,
        isActive: rawCohort.isActive === true,
      };
    }
  }

  return {
    appSlug: input.appSlug,
    period: input.period,
    sessionHash: input.sessionHash,
    metrics,
  };
}
