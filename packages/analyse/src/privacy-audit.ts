/**
 * Privacy audit — Phase 2 deploy intelligence.
 *
 * Where security-scan answers "is this app safe?", privacy-audit answers
 * "where does data flow?". Walks JS/HTML/CSS to extract every outbound
 * domain reference and classifies each one:
 *
 *   - tracker:      analytics + ad networks (Google Analytics, Mixpanel,
 *                   Segment, Sentry, etc.) — flagged for removal
 *   - feature:      external feature data (weather APIs, recipe APIs) —
 *                   ok with caching
 *   - cdn:          script/font/style CDN — ok but worth self-hosting
 *   - shippie:      shippie.app domains — always allowed
 *   - same-origin:  the app's own slug.shippie.app — always allowed
 *   - unknown:      anything else, surfaced for the maker to label
 *
 * The classification feeds the kind detection (Local / Connected / Cloud)
 * and the public Privacy Grade (A+ → F). Phase 4 turns the grade public;
 * for now this module just produces the raw evidence.
 *
 * Pure functional. No network I/O during the scan. Domain classification
 * uses a static list rather than a live database — false negatives on
 * obscure trackers are acceptable; we'll tune the list over time.
 */

export type DomainCategory =
  | 'tracker'
  | 'feature'
  | 'cdn'
  | 'shippie'
  | 'same-origin'
  | 'unknown';

export interface DomainReference {
  host: string;
  category: DomainCategory;
  /** Why we labelled it this category (matched suffix or explicit listing). */
  reason: string;
  /** Files that reference this host. Capped at 5 paths to keep the report
   *  compact — the count is what matters for the score. */
  files: string[];
  /** Total occurrences across all files. */
  occurrences: number;
}

export interface PrivacyAuditReport {
  domains: DomainReference[];
  /** Quick counts by category for the maker dashboard. */
  counts: Record<DomainCategory, number>;
  /** Files actually scanned. */
  scannedFiles: number;
}

/**
 * Tracker / analytics / observability hosts we've seen in the wild.
 * Match by host suffix so subdomains (gtm.googletagmanager.com) match
 * the parent (googletagmanager.com).
 */
const TRACKER_SUFFIXES = new Set<string>([
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googlesyndication.com',
  'facebook.com', // pixel
  'facebook.net',
  'mixpanel.com',
  'amplitude.com',
  'segment.com',
  'segment.io',
  'sentry.io',
  'bugsnag.com',
  'fullstory.com',
  'hotjar.com',
  'logrocket.com',
  'intercom.io',
  'intercom.com',
  'hubspot.com',
  'matomo.cloud',
  'plausible.io',
  // Plausible is privacy-respecting but still phones home — flag as
  // tracker so makers can choose to switch to Shippie's privacy beacons.
]);

/** Generic CDN suffixes — usually fine but Phase 4 self-hosts them. */
const CDN_SUFFIXES = new Set<string>([
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'esm.sh',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'maxcdn.bootstrapcdn.com',
  'kit.fontawesome.com',
  'use.fontawesome.com',
  'use.typekit.net',
]);

/** Shippie-owned suffixes — always allowed, never flagged. */
const SHIPPIE_SUFFIXES = new Set<string>(['shippie.app', 'shippie.dev']);

const decoder = new TextDecoder('utf-8', { fatal: false });

const SCANNABLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.css',
  '.json',
  '.svg',
]);

const URL_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?[/'\s">]/gi;

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot).toLowerCase();
}

function shouldScan(path: string): boolean {
  return SCANNABLE_EXTENSIONS.has(fileExtension(path));
}

function suffixMatches(host: string, suffixes: Iterable<string>): string | null {
  for (const s of suffixes) {
    if (host === s || host.endsWith('.' + s)) return s;
  }
  return null;
}

export interface ClassifyOptions {
  /**
   * Same-origin app host (e.g. `palate.shippie.app`). References to this
   * host are never flagged as external.
   */
  appHost?: string | null;
  /**
   * Domains the maker explicitly declared in shippie.json's
   * `allowed_connect_domains`. These are reported as `feature` (not `unknown`).
   */
  allowedFeatureDomains?: ReadonlyArray<string>;
}

export function classifyDomain(host: string, opts: ClassifyOptions = {}): {
  category: DomainCategory;
  reason: string;
} {
  if (opts.appHost && host === opts.appHost) {
    return { category: 'same-origin', reason: 'app self-host' };
  }
  const ship = suffixMatches(host, SHIPPIE_SUFFIXES);
  if (ship) return { category: 'shippie', reason: `shippie infra (${ship})` };

  const tracker = suffixMatches(host, TRACKER_SUFFIXES);
  if (tracker) return { category: 'tracker', reason: `known tracker (${tracker})` };

  const cdn = suffixMatches(host, CDN_SUFFIXES);
  if (cdn) return { category: 'cdn', reason: `known cdn (${cdn})` };

  if (opts.allowedFeatureDomains?.some((d) => host === d || host.endsWith('.' + d))) {
    return { category: 'feature', reason: 'declared in allowed_connect_domains' };
  }

  return { category: 'unknown', reason: 'no match in known classifiers' };
}

export function runPrivacyAudit(
  files: ReadonlyMap<string, Uint8Array>,
  opts: ClassifyOptions = {},
): PrivacyAuditReport {
  type Bucket = {
    host: string;
    category: DomainCategory;
    reason: string;
    files: Set<string>;
    occurrences: number;
  };
  const byHost = new Map<string, Bucket>();
  let scanned = 0;

  for (const [path, bytes] of files) {
    if (!shouldScan(path)) continue;
    scanned++;
    let body: string;
    try {
      body = decoder.decode(bytes);
    } catch {
      continue;
    }
    URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_RE.exec(body))) {
      const host = match[1]?.toLowerCase();
      if (!host) continue;
      let bucket = byHost.get(host);
      if (!bucket) {
        const cls = classifyDomain(host, opts);
        bucket = {
          host,
          category: cls.category,
          reason: cls.reason,
          files: new Set(),
          occurrences: 0,
        };
        byHost.set(host, bucket);
      }
      bucket.occurrences++;
      bucket.files.add(path);
    }
  }

  const counts: Record<DomainCategory, number> = {
    tracker: 0,
    feature: 0,
    cdn: 0,
    shippie: 0,
    'same-origin': 0,
    unknown: 0,
  };

  const domains: DomainReference[] = [];
  for (const b of byHost.values()) {
    counts[b.category]++;
    domains.push({
      host: b.host,
      category: b.category,
      reason: b.reason,
      files: Array.from(b.files).slice(0, 5).sort(),
      occurrences: b.occurrences,
    });
  }
  // Sort: trackers first (most actionable), then unknown, then by host.
  const order: Record<DomainCategory, number> = {
    tracker: 0,
    unknown: 1,
    feature: 2,
    cdn: 3,
    'same-origin': 4,
    shippie: 5,
  };
  domains.sort((a, b) =>
    order[a.category] !== order[b.category]
      ? order[a.category] - order[b.category]
      : a.host.localeCompare(b.host),
  );

  return { domains, counts, scannedFiles: scanned };
}
