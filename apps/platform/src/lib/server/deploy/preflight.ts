/**
 * Static-deploy preflight rules — Worker-friendly port of
 * apps/web/lib/preflight/.
 *
 * Trimmed to the rules that block deploy correctness in v0:
 *   - reserved-paths-collision (HARD BLOCK on __shippie/* in zip)
 *   - service-worker-ownership (HARD BLOCK on root SW conflict)
 *   - entry-file-present       (HARD BLOCK on missing index.html)
 *   - output-size              (warn @ 100MB, block @ 200MB)
 *   - server-code              (HARD BLOCK on SSR detection)
 *   - slug-validation          (HARD BLOCK on bad slug or reserved)
 *
 * Skipped vs apps/web:
 *   - shippie-json-present (auto-draft is handled in manifest.ts; the
 *     rule only emits an info-level finding)
 */

const RESERVED_PATH_PREFIX = '__shippie/';

export interface PreflightInput {
  slug: string;
  manifest: { type: string; name: string };
  files: Map<string, Uint8Array>;
  totalBytes: number;
  reservedSlugs: ReadonlySet<string>;
}

export interface PreflightFinding {
  rule: string;
  severity: 'pass' | 'warn' | 'block' | 'fix';
  title: string;
  detail?: string;
}

export interface PreflightReport {
  passed: boolean;
  findings: PreflightFinding[];
  warnings: PreflightFinding[];
  blockers: PreflightFinding[];
  durationMs: number;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const ROOT_SW_EXACT = new Set([
  'sw.js',
  'service-worker.js',
  'serviceworker.js',
  'firebase-messaging-sw.js',
  'ngsw-worker.js',
]);

const SERVER_DIR_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /(^|\/)\.vercel\/output\//, label: '.vercel/output/' },
  { pattern: /(^|\/)pages\/api\//, label: 'pages/api/' },
  { pattern: /(^|\/)app\/api\//, label: 'app/api/' },
  { pattern: /(^|\/)server\//, label: 'server/' },
  { pattern: /(^|\/)netlify\/functions\//, label: 'netlify/functions/' },
  { pattern: /(^|\/)functions\//, label: 'functions/' },
  { pattern: /(^|\/)\.output\/server\//, label: '.output/server/' },
];

export function runPreflight(input: PreflightInput): PreflightReport {
  const start = Date.now();
  const findings: PreflightFinding[] = [];

  // -- slug validation
  if (!SLUG_RE.test(input.slug)) {
    findings.push({
      rule: 'slug-validation',
      severity: 'block',
      title: 'Invalid slug format',
      detail: 'Slug must be 1-63 chars, lowercase letters/digits/hyphens.',
    });
  } else if (input.reservedSlugs.has(input.slug)) {
    findings.push({
      rule: 'slug-validation',
      severity: 'block',
      title: `Slug '${input.slug}' is reserved`,
    });
  } else {
    findings.push({ rule: 'slug-validation', severity: 'pass', title: 'Slug is valid' });
  }

  // -- reserved-paths-collision
  const collisions: string[] = [];
  for (const path of input.files.keys()) {
    const norm = path.startsWith('/') ? path.slice(1) : path;
    if (norm.startsWith(RESERVED_PATH_PREFIX)) collisions.push(path);
  }
  if (collisions.length > 0) {
    findings.push({
      rule: 'reserved-paths-collision',
      severity: 'block',
      title: `${collisions.length} file(s) collide with reserved __shippie/* paths`,
    });
  } else {
    findings.push({ rule: 'reserved-paths-collision', severity: 'pass', title: 'No __shippie/* collisions' });
  }

  // -- service-worker-ownership
  const swConflicts = [...input.files.keys()].filter(isRootServiceWorker);
  if (swConflicts.length > 0) {
    findings.push({
      rule: 'service-worker-ownership',
      severity: 'block',
      title: 'Maker root service worker conflicts with Shippie runtime',
      detail: `Remove or rename: ${swConflicts.join(', ')}`,
    });
  } else {
    findings.push({ rule: 'service-worker-ownership', severity: 'pass', title: 'No root SW conflict' });
  }

  // -- entry-file-present
  if (input.manifest.type === 'website' && input.files.size > 0) {
    findings.push({ rule: 'entry-file-present', severity: 'pass', title: 'Website has output files' });
  } else if (input.files.size === 0) {
    findings.push({
      rule: 'entry-file-present',
      severity: 'block',
      title: 'Output directory is empty',
    });
  } else {
    const hasIndex = [...input.files.keys()].some(
      (f) => f === 'index.html' || f === '/index.html' || f.endsWith('/index.html'),
    );
    if (!hasIndex) {
      findings.push({
        rule: 'entry-file-present',
        severity: 'block',
        title: 'No index.html in output',
      });
    } else {
      findings.push({ rule: 'entry-file-present', severity: 'pass', title: 'index.html found' });
    }
  }

  // -- output-size
  const WARN_BYTES = 100 * 1024 * 1024;
  const BLOCK_BYTES = 200 * 1024 * 1024;
  if (input.totalBytes > BLOCK_BYTES) {
    findings.push({
      rule: 'output-size',
      severity: 'block',
      title: `Output exceeds ${formatBytes(BLOCK_BYTES)} limit`,
    });
  } else if (input.totalBytes > WARN_BYTES) {
    findings.push({
      rule: 'output-size',
      severity: 'warn',
      title: `Output is ${formatBytes(input.totalBytes)}`,
    });
  } else {
    findings.push({
      rule: 'output-size',
      severity: 'pass',
      title: `Output is ${formatBytes(input.totalBytes)}`,
    });
  }

  // -- server-code
  const serverSignals: string[] = [];
  for (const path of input.files.keys()) {
    for (const { pattern, label } of SERVER_DIR_PATTERNS) {
      if (pattern.test(path)) {
        serverSignals.push(label);
        break;
      }
    }
  }
  if (serverSignals.length > 0) {
    findings.push({
      rule: 'server-code',
      severity: 'block',
      title: `Server-side code detected (${[...new Set(serverSignals)].join(', ')})`,
      detail: 'Shippie hosts static bundles only. Use Wrap mode at /new instead.',
    });
  } else {
    findings.push({ rule: 'server-code', severity: 'pass', title: 'No server-side code detected' });
  }

  const warnings = findings.filter((f) => f.severity === 'warn');
  const blockers = findings.filter((f) => f.severity === 'block');
  return {
    passed: blockers.length === 0,
    findings,
    warnings,
    blockers,
    durationMs: Date.now() - start,
  };
}

function isRootServiceWorker(path: string): boolean {
  const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  if (ROOT_SW_EXACT.has(clean)) return true;
  return /^workbox-[a-z0-9._-]+\.js$/.test(clean);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
