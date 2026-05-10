/**
 * Arcade purity scanner.
 *
 * For uploads with `surface: 'arcade'`, we promise the user "no ads,
 * no tracking, no IAP". This module is the static-analysis half of
 * that contract. The runtime half is the CSP header + capability
 * denylist installed by the bridge / `hooks.server.ts` /
 * `prepare-showcases.mjs`.
 *
 * The two together — static + runtime — make the "no monetisation,
 * no surveillance" guarantee resistant to maker mistakes (CSP catches
 * what the scanner misses) AND maker malice (scanner catches what's
 * obfuscated past the CSP).
 *
 * **What we scan**: every text-ish file in the uploaded zip (HTML,
 * JS, MJS, TS-source, JSX/TSX, CSS, JSON). Binaries are skipped — the
 * payloads they carry can't load network code without the JS already
 * referencing them, which the JS scan catches.
 *
 * **Pattern list is versioned** — bump `PATTERNS_VERSION` when adding
 * detections so we can audit which apps were scanned with which
 * pattern set.
 */

export const PATTERNS_VERSION = '2026-05-10.v1';

interface Pattern {
  /** Regex the scanner runs against each scanned file. Case-insensitive. */
  match: RegExp;
  /** Human-readable label included in offence reports. */
  label: string;
  /** Free-text category — surfaces as the offence's `kind`. */
  kind: 'analytics' | 'tracker' | 'ads' | 'iap' | 'crash-beacon';
}

// Patterns are matched against file CONTENTS (not paths) so a
// `vendored.js` blob still trips them. Keep them tight — overly
// generic patterns ("track") would false-positive on game logic.
const PATTERNS: ReadonlyArray<Pattern> = [
  // --- Analytics SDKs / endpoints ---
  { kind: 'analytics', label: 'google-analytics', match: /google-analytics\.com/i },
  { kind: 'analytics', label: 'googletagmanager', match: /googletagmanager\.com/i },
  { kind: 'analytics', label: 'gtag()', match: /\bgtag\s*\(/ },
  { kind: 'analytics', label: 'mixpanel', match: /(api\.)?mixpanel\.com/i },
  { kind: 'analytics', label: 'segment.io', match: /(api\.)?segment\.(io|com)/i },
  { kind: 'analytics', label: 'amplitude', match: /(api\.)?amplitude\.com/i },
  { kind: 'analytics', label: 'plausible', match: /plausible\.io/i },
  { kind: 'analytics', label: 'umami', match: /umami\.is\b|cloud\.umami\.is/i },
  { kind: 'analytics', label: 'posthog', match: /(app|us|eu)\.posthog\.com/i },
  { kind: 'analytics', label: 'hotjar', match: /static\.hotjar\.com|script\.hotjar\.com/i },
  { kind: 'analytics', label: 'fullstory', match: /fullstory\.com/i },
  { kind: 'analytics', label: 'logrocket', match: /logrocket\.com/i },

  // --- Ad networks / trackers ---
  { kind: 'ads', label: 'doubleclick', match: /doubleclick\.net/i },
  { kind: 'ads', label: 'adsense', match: /pagead2\.googlesyndication\.com|adsbygoogle/i },
  { kind: 'tracker', label: 'facebook-pixel', match: /connect\.facebook\.net|fbq\s*\(/i },
  { kind: 'tracker', label: 'fbcdn', match: /fbcdn\.net/i },
  { kind: 'tracker', label: 'tiktok pixel', match: /analytics\.tiktok\.com/i },
  { kind: 'tracker', label: 'twitter pixel', match: /static\.ads-twitter\.com/i },
  { kind: 'tracker', label: 'linkedin insight', match: /snap\.licdn\.com/i },

  // --- Crash / RUM beacons (still surveillance from the user's POV) ---
  {
    kind: 'crash-beacon',
    label: 'sentry beacon',
    match: /(?:sentry|ingest\.sentry)\.io/i,
  },
  { kind: 'crash-beacon', label: 'cloudflare RUM beacon', match: /static\.cloudflareinsights\.com/i },
  { kind: 'crash-beacon', label: 'datadog rum', match: /browser-intake-datadoghq\.com/i },
  { kind: 'crash-beacon', label: 'bugsnag', match: /notify\.bugsnag\.com/i },
  { kind: 'crash-beacon', label: 'rollbar', match: /api\.rollbar\.com/i },

  // --- Payments / IAP — Arcade is "no monetisation". Tools/apps OK. ---
  { kind: 'iap', label: 'paddle.js', match: /cdn\.paddle\.com\b|paddle\.Setup/i },
  { kind: 'iap', label: 'stripe checkout', match: /checkout\.stripe\.com|js\.stripe\.com/i },
  { kind: 'iap', label: 'apple-pay button', match: /<\s*apple-pay-button|applePaySession/i },
  { kind: 'iap', label: 'lemonsqueezy overlay', match: /lemonsqueezy\.com\/.*overlay/i },
  { kind: 'iap', label: 'gumroad overlay', match: /gumroad\.com\/.*overlay|gumroad\.com\/l\//i },
];

export interface PurityOffence {
  file: string;
  pattern: string;
  kind: Pattern['kind'];
  /** 1-indexed line number of the first match. May be omitted if the file is binary-ish. */
  line?: number;
}

export interface PurityResult {
  ok: boolean;
  patternsVersion: string;
  offences: PurityOffence[];
  /** Number of files scanned (excluding skipped binaries). */
  filesScanned: number;
}

const SCANNABLE_EXTENSIONS = new Set([
  'html', 'htm',
  'js', 'mjs', 'cjs',
  'ts', 'tsx', 'jsx',
  'css',
  'json',
  'xml', 'svg',
  'txt', 'md',
]);

function extOf(path: string): string {
  const ix = path.lastIndexOf('.');
  return ix === -1 ? '' : path.slice(ix + 1).toLowerCase();
}

function decodeText(bytes: Uint8Array): string | null {
  // Best-effort UTF-8 decode. Heuristic: if the file has a NUL byte in
  // the first 1KB, treat as binary and skip.
  const head = bytes.subarray(0, Math.min(1024, bytes.length));
  for (const b of head) if (b === 0x00) return null;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function findLine(text: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/**
 * Scan an extracted bundle for ad/tracker/IAP signatures.
 *
 * @param files — same map shape as the deploy pipeline uses (path → bytes)
 * @returns ok + offences + scanned-file count + pattern-set version
 */
export function checkArcadePurity(files: Map<string, Uint8Array>): PurityResult {
  const offences: PurityOffence[] = [];
  let filesScanned = 0;

  for (const [path, bytes] of files) {
    if (!SCANNABLE_EXTENSIONS.has(extOf(path))) continue;
    const text = decodeText(bytes);
    if (text === null) continue;
    filesScanned++;

    for (const pattern of PATTERNS) {
      const m = pattern.match.exec(text);
      if (m && m.index !== undefined) {
        offences.push({
          file: path,
          pattern: pattern.label,
          kind: pattern.kind,
          line: findLine(text, m.index),
        });
        // Don't break — surface multiple distinct patterns per file
        // so the maker sees the full picture in one upload attempt.
      }
    }
  }

  return {
    ok: offences.length === 0,
    patternsVersion: PATTERNS_VERSION,
    offences,
    filesScanned,
  };
}

/**
 * Validate `allowed_connect_domains` for Arcade uploads. Arcade apps
 * must keep network calls inside Shippie's own infrastructure (or
 * none at all). Returns ok=false if the maker tries to whitelist
 * external hosts.
 */
const SHIPPIE_HOST_RE = /(^|\.)shippie\.app$/i;

export function checkArcadeConnectDomains(
  domains: ReadonlyArray<string> | undefined,
): { ok: true } | { ok: false; offences: string[] } {
  if (!domains || domains.length === 0) return { ok: true };
  const offences: string[] = [];
  for (const raw of domains) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Strip protocol + path so 'https://evil.com/x' is checked against
    // 'evil.com'.
    const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
    const host = withoutScheme.split('/')[0]?.split(':')[0] ?? withoutScheme;
    if (!SHIPPIE_HOST_RE.test(host) && host.toLowerCase() !== 'shippie.app') {
      offences.push(raw);
    }
  }
  return offences.length === 0 ? { ok: true } : { ok: false, offences };
}
