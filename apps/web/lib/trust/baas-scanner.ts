/**
 * BaaS hostname scanner — walks a deploy's file tree and resolves the
 * specific hostnames of any known Backend-as-a-Service provider that the
 * bundle talks to (Supabase, Firebase, Clerk, Auth0, Neon, PlanetScale,
 * Upstash, Vercel Storage).
 *
 * Why it exists
 * -------------
 * Shippie's CSP is tight-by-default: `connect-src 'self'` unless the maker
 * opts in via `permissions.external_network: true` AND declares domains in
 * `allowed_connect_domains`. Makers who zip up a Supabase/Firebase/Clerk
 * app without a shippie.json would otherwise get their requests silently
 * blocked at runtime — the #1 "why doesn't my app work" footgun.
 *
 * This scanner runs during auto-draft (not when the maker provides a
 * shippie.json — their declaration always wins) and returns the concrete
 * hostnames we found so the draft can pre-populate
 * `allowed_connect_domains` with exactly the subdomains the app uses.
 *
 * Design notes
 * ------------
 *   - Regex over string contents; good enough for minified bundles and
 *     source alike. Same trade-off as domain-scan.ts: we'd rather surface
 *     an unused domain than miss a real one.
 *   - Per-file 5 MB cap. Shippie already caps individual file size upstream
 *     in preflight, but a paranoid head-read keeps this cheap if a bigger
 *     file ever sneaks through.
 *   - Only HTML + JS-family files are scanned (same classifier as
 *     domain-scan). A Supabase URL buried in a binary asset isn't a
 *     real runtime dependency.
 *   - Wildcards in the curated list are resolved to the specific subdomain
 *     we actually see (e.g. `*.supabase.co` → `abc123.supabase.co`).
 */

/** Max bytes read per file. Head-reads anything larger. */
const PER_FILE_BYTE_CAP = 5 * 1024 * 1024; // 5 MB

/**
 * Curated list of BaaS-provider hostname patterns, grouped by provider
 * for the human-readable report line. Each pattern is one of:
 *
 *   - `*.supabase.co`        — any subdomain of supabase.co
 *   - `firebasestorage.googleapis.com` — exact match
 *
 * New patterns should be additive — removing one could silently break an
 * app in production.
 */
export interface BaasProvider {
  name: string;
  patterns: readonly string[];
}

export const BAAS_PROVIDERS: readonly BaasProvider[] = [
  {
    name: 'Supabase',
    patterns: ['*.supabase.co', '*.supabase.in'],
  },
  {
    name: 'Firebase',
    patterns: [
      '*.firebaseio.com',
      'firebasestorage.googleapis.com',
      '*.firebaseapp.com',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
      'firestore.googleapis.com',
      'fcm.googleapis.com',
    ],
  },
  {
    name: 'Clerk',
    patterns: ['*.clerk.accounts.dev', '*.clerk.com', 'clerk.dev', '*.clerk.dev'],
  },
  {
    name: 'Auth0',
    patterns: ['*.auth0.com'],
  },
  {
    name: 'Vercel Storage',
    patterns: ['*.vercel-storage.com', '*.public.blob.vercel-storage.com'],
  },
  {
    name: 'Upstash',
    patterns: ['*.upstash.io'],
  },
  {
    name: 'PlanetScale',
    patterns: ['*.planetscale.com', '*.psdb.cloud'],
  },
  {
    name: 'Neon',
    patterns: ['*.neon.tech'],
  },
];

export interface BaasScanResult {
  found: boolean;
  /** Concrete hostnames, deduped + sorted. */
  domains: string[];
  /** Provider names we matched, deduped + sorted — for the report line. */
  providers: string[];
}

// Same URL pattern as domain-scan.ts — captures host (group 1) from any
// http(s):// URL. We re-declare so the two scanners are independent.
const URL_PATTERN = /https?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])(?::\d+)?(?:\/[^\s"'<>`)}\],]*)?/gi;

export function scanForBaas(files: Map<string, Buffer>): BaasScanResult {
  const domains = new Set<string>();
  const providers = new Set<string>();

  for (const [path, buf] of files) {
    if (!isScannable(path)) continue;

    const slice = buf.byteLength > PER_FILE_BYTE_CAP ? buf.subarray(0, PER_FILE_BYTE_CAP) : buf;
    const text = slice.toString('utf8');

    for (const match of text.matchAll(URL_PATTERN)) {
      const host = match[1]!.toLowerCase().replace(/\.+$/, '');
      const provider = matchProvider(host);
      if (!provider) continue;
      domains.add(host);
      providers.add(provider.name);
    }
  }

  return {
    found: domains.size > 0,
    domains: [...domains].sort(),
    providers: [...providers].sort(),
  };
}

/**
 * Return true when a bare string looks like a hostname owned by a known
 * BaaS provider. Exported for the manifest-drafting layer so it can reject
 * obviously-bogus domains the maker might have put in
 * allowed_connect_domains.
 */
export function matchProvider(host: string): BaasProvider | null {
  for (const provider of BAAS_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (hostMatches(host, pattern)) return provider;
    }
  }
  return null;
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();

  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".supabase.co"
    // Require at least one label before the suffix, and reject the bare
    // apex (pattern is *.x.y — "x.y" alone shouldn't match).
    return h.length > suffix.length && h.endsWith(suffix);
  }
  return h === p;
}

function isScannable(path: string): boolean {
  const lower = path.toLowerCase();
  if (/\.html?$/.test(lower)) return true;
  if (/\.(js|mjs|cjs|ts|tsx|jsx|svelte|vue)$/.test(lower)) return true;
  // JSON can hold endpoints too (config.json, env.json, manifest.json).
  if (/\.json$/.test(lower)) return true;
  return false;
}
