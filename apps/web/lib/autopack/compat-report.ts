/**
 * Compatibility report — static analysis of a deploy's JS/HTML files
 * against the permissions declared in shippie.json.
 *
 * Walks the file tree looking for `shippie.X.Y(...)` call patterns, then
 * cross-references them with `shippie.json.permissions`. Any SDK call
 * that requires a permission the app didn't declare becomes a finding:
 *
 *   ✓ matches   — both code and manifest agree
 *   ⚠ declared  — manifest declares it but code doesn't use it (cleanup)
 *   ✗ violation — code uses it but manifest doesn't declare it (will 403)
 *
 * Surface star rating: 5 - (violations * 2) - warnings, clamped to 1..5.
 *
 * Spec v6 §9 (trust — compatibility report).
 */
import type { ShippieJson } from '@shippie/shared';

export interface CompatFinding {
  severity: 'match' | 'declared_unused' | 'violation';
  capability: string;
  evidence?: string;
  message: string;
}

export interface CompatReport {
  score: number; // 1..5 stars
  findings: CompatFinding[];
  summary: {
    matches: number;
    warnings: number;
    violations: number;
  };
}

interface CapabilitySpec {
  name: string;
  patterns: RegExp[];
  declared: (p: NonNullable<ShippieJson['permissions']>) => boolean;
  label: string;
}

const CAPABILITIES: CapabilitySpec[] = [
  {
    name: 'auth',
    label: 'Sign in',
    patterns: [/\bshippie\.auth\.(signIn|signOut|getUser)\b/],
    declared: (p) => !!p.auth,
  },
  {
    name: 'storage',
    label: 'User data storage',
    patterns: [/\bshippie\.db\.(get|set|list|delete)\b/],
    declared: (p) => p.storage !== 'none' && p.storage !== undefined && p.storage !== null,
  },
  {
    name: 'files',
    label: 'File uploads',
    patterns: [/\bshippie\.files\.(upload|get|delete|list)\b/],
    declared: (p) => !!p.files,
  },
  {
    name: 'notifications',
    label: 'Push notifications',
    patterns: [/\bshippie\.notifications\.(subscribe|unsubscribe|send)\b/],
    declared: (p) => !!p.notifications,
  },
  {
    name: 'analytics',
    label: 'Analytics events',
    patterns: [/\bshippie\.analytics\.(track|event)\b/],
    declared: (p) => p.analytics !== false,
  },
  {
    name: 'external_network',
    label: 'External network calls',
    patterns: [/\bshippie\.fn\b|\bfetch\(["']https?:\/\//],
    declared: (p) => !!p.external_network,
  },
];

export interface RunCompatInput {
  files: Map<string, Buffer>;
  manifest: ShippieJson;
}

export function runCompatReport(input: RunCompatInput): CompatReport {
  const permissions = input.manifest.permissions ?? {};
  const findings: CompatFinding[] = [];

  // Flatten all JS / HTML / TS content into one searchable string. This
  // is a naive approach — we explicitly don't try to parse AST here
  // because it would add a heavy dep (acorn/esbuild/swc) for a report
  // that's meant to be directional, not precise.
  let haystack = '';
  for (const [path, buf] of input.files) {
    if (/\.(js|mjs|cjs|ts|tsx|jsx|html?|svelte|vue)$/i.test(path)) {
      haystack += '\n' + buf.toString('utf8');
    }
  }

  for (const cap of CAPABILITIES) {
    const used = cap.patterns.some((p) => p.test(haystack));
    const declared = cap.declared(permissions);

    if (used && declared) {
      findings.push({
        severity: 'match',
        capability: cap.name,
        message: `${cap.label} — used and declared`,
      });
    } else if (used && !declared) {
      findings.push({
        severity: 'violation',
        capability: cap.name,
        message: `${cap.label} is used in code but not declared in shippie.json.permissions — calls will return 403 at runtime`,
      });
    } else if (!used && declared) {
      findings.push({
        severity: 'declared_unused',
        capability: cap.name,
        message: `${cap.label} is declared but not used in code — consider removing from shippie.json`,
      });
    }
  }

  const matches = findings.filter((f) => f.severity === 'match').length;
  const warnings = findings.filter((f) => f.severity === 'declared_unused').length;
  const violations = findings.filter((f) => f.severity === 'violation').length;

  // Score: 5 stars baseline, -2 per violation, -0.5 per warning, floor 1
  let score = 5 - violations * 2 - warnings * 0.5;
  if (score < 1) score = 1;
  if (score > 5) score = 5;
  score = Math.round(score);

  return {
    score,
    findings,
    summary: { matches, warnings, violations },
  };
}
