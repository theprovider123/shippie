/**
 * Security scan — Phase 2 deploy intelligence.
 *
 * Pure functional scanner over an extracted file map. Returns structured
 * findings with explainable reasons so the deploy report can surface
 * "what was flagged and why" verbatim to the maker.
 *
 * Phase 4 of the master plan computes a numeric score from these findings
 * and gates the public surface. This module produces the raw evidence;
 * scoring lives elsewhere.
 *
 * What this catches today:
 *   - Hardcoded secrets (Supabase anon keys, AWS access keys, generic JWTs,
 *     Stripe keys, Firebase API keys with config blobs, GitHub PATs)
 *   - Inline event handlers (onclick=, onerror=, javascript: URIs)
 *   - Mixed content (http:// URLs in non-relative resource loads)
 *   - External scripts loaded from non-allowlisted hosts
 *
 * Out of scope (Phase 2.5+ or Phase 3):
 *   - Dependency vulnerability scanning (would require lockfile parsing)
 *   - CVE database lookups
 *   - Runtime sandbox observation
 */

export type SecurityFindingSeverity = 'block' | 'warn' | 'info';

export interface SecurityFinding {
  /** Stable rule id — useful for the dashboard to dedupe across deploys. */
  rule: SecurityRuleId;
  severity: SecurityFindingSeverity;
  /** One-line summary surfaced in the deploy stream. */
  title: string;
  /** Maker-facing explanation of why this matters. */
  reason: string;
  /** Where the issue was found — usually a file path. */
  location: string;
  /** Optional snippet (heavily redacted for secrets). */
  snippet?: string;
}

export type SecurityRuleId =
  | 'secret_supabase_anon'
  | 'secret_aws_access_key'
  | 'secret_jwt'
  | 'secret_stripe_key'
  | 'secret_firebase_apikey'
  | 'secret_github_token'
  | 'secret_openai_key'
  | 'inline_event_handler'
  | 'javascript_uri'
  | 'mixed_content'
  | 'external_script_unknown_host';

export interface SecurityScanReport {
  findings: SecurityFinding[];
  /** Counts by severity for quick dashboarding. */
  blocks: number;
  warns: number;
  infos: number;
  /** Files that were scanned. Helps the dashboard explain coverage. */
  scannedFiles: number;
}

interface SecretPattern {
  rule: SecurityRuleId;
  /** Matches the secret string itself. Only group(0) is used. */
  pattern: RegExp;
  title: string;
  reason: string;
  /** When true the deploy report MAY block the deploy in the wrapping
   *  pipeline. Defaults to false (warn only — Phase 4 enforces). */
  block?: boolean;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    rule: 'secret_supabase_anon',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
    title: 'JWT-shaped token in client bundle',
    reason:
      'Looks like a JWT (Supabase anon key, NextAuth session, or similar). ' +
      'In a Shippie local-first app, you usually do not need API keys at all — ' +
      'data lives on the user device. If you do need this, gate it behind a ' +
      'maker-allowlisted env var rather than embedding in the bundle.',
  },
  {
    rule: 'secret_aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    title: 'AWS access key id in client bundle',
    reason:
      'AWS keys in client code grant any visitor the same permissions you have. ' +
      'Rotate the key immediately and move the call to a server or local SDK.',
    block: true,
  },
  {
    rule: 'secret_stripe_key',
    pattern: /sk_(live|test)_[A-Za-z0-9]{20,}/g,
    title: 'Stripe secret key in client bundle',
    reason:
      'Stripe secret keys must never reach the browser — they grant full charge / refund / ' +
      'transfer access. Rotate the key and move to server-side or use a publishable (pk_) key.',
    block: true,
  },
  {
    rule: 'secret_firebase_apikey',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    title: 'Firebase / Google Cloud API key in bundle',
    reason:
      'Firebase API keys are technically public-by-design but are still worth scoping in the GCP ' +
      'console (HTTP referrer + API restriction). Without scoping, this key can run up your bill.',
  },
  {
    rule: 'secret_github_token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    title: 'GitHub personal access token in bundle',
    reason:
      'GitHub tokens grant repo / org access to anyone who fetches the bundle. Rotate the token ' +
      'and move the call server-side.',
    block: true,
  },
  {
    rule: 'secret_openai_key',
    pattern: /sk-[A-Za-z0-9_-]{20,}/g,
    title: 'OpenAI / Anthropic-style API key in bundle',
    reason:
      'LLM provider keys in client code mean anyone visiting the app can drain your account. ' +
      'Rotate immediately. If you need LLM inference, run it locally via Shippie AI.',
    block: true,
  },
];

/**
 * File extensions worth scanning. We deliberately skip media, fonts,
 * and binary files — they cannot meaningfully contain secrets, and
 * regexp scanning megabytes of binary data wastes the deploy budget.
 */
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
  '.txt',
  '.md',
  '.svg',
]);

/** Hosts where external <script src> is reasonable without raising a flag. */
const TRUSTED_SCRIPT_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'esm.sh',
  // Shippie's own infrastructure.
  'shippie.app',
  'cdn.shippie.app',
]);

const INLINE_HANDLER_RE =
  /\bon(?:click|change|submit|focus|blur|load|error|mouseover|mouseout|keydown|keyup|keypress|input|select|scroll|resize|wheel)\s*=\s*["']/gi;
const JS_URI_RE = /\b(?:href|src|action)\s*=\s*["']javascript:/gi;
const MIXED_CONTENT_RE = /\b(?:src|href|action|data|formaction)\s*=\s*["']http:\/\//gi;
const EXTERNAL_SCRIPT_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

const decoder = new TextDecoder('utf-8', { fatal: false });

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot).toLowerCase();
}

function shouldScan(path: string): boolean {
  return SCANNABLE_EXTENSIONS.has(fileExtension(path));
}

function redactSecret(s: string): string {
  if (s.length <= 12) return s.slice(0, 4) + '…';
  return s.slice(0, 6) + '…' + s.slice(-4);
}

function scanForSecrets(path: string, body: string, findings: SecurityFinding[]): void {
  for (const sp of SECRET_PATTERNS) {
    sp.pattern.lastIndex = 0;
    const matches = body.match(sp.pattern);
    if (!matches) continue;
    // Dedupe identical strings so the report doesn't repeat the same
    // bundled secret 12 times across chunks.
    const seen = new Set<string>();
    for (const raw of matches) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      findings.push({
        rule: sp.rule,
        severity: sp.block ? 'block' : 'warn',
        title: sp.title,
        reason: sp.reason,
        location: path,
        snippet: redactSecret(raw),
      });
    }
  }
}

function scanForInlineHandlers(path: string, body: string, findings: SecurityFinding[]): void {
  if (!path.endsWith('.html') && !path.endsWith('.htm')) return;
  INLINE_HANDLER_RE.lastIndex = 0;
  const inlineCount = (body.match(INLINE_HANDLER_RE) ?? []).length;
  if (inlineCount > 0) {
    findings.push({
      rule: 'inline_event_handler',
      severity: 'info',
      title: `${inlineCount} inline event handler${inlineCount === 1 ? '' : 's'}`,
      reason:
        'Inline handlers (onclick="…") block CSP nonce hardening and are common in vibe-coded ' +
        'apps. Not a deploy blocker — flagged so you can choose to hoist them into JS later.',
      location: path,
    });
  }
  JS_URI_RE.lastIndex = 0;
  const jsUriMatches = body.match(JS_URI_RE);
  if (jsUriMatches) {
    findings.push({
      rule: 'javascript_uri',
      severity: 'warn',
      title: `javascript: URI in href/src (×${jsUriMatches.length})`,
      reason:
        'javascript: URIs are an XSS vector when combined with user content. Replace with ' +
        'event listeners.',
      location: path,
    });
  }
}

function scanForMixedContent(path: string, body: string, findings: SecurityFinding[]): void {
  if (!path.endsWith('.html') && !path.endsWith('.htm') && !path.endsWith('.css')) return;
  MIXED_CONTENT_RE.lastIndex = 0;
  const matches = body.match(MIXED_CONTENT_RE);
  if (matches && matches.length > 0) {
    findings.push({
      rule: 'mixed_content',
      severity: 'warn',
      title: `${matches.length} insecure (http://) resource reference${matches.length === 1 ? '' : 's'}`,
      reason:
        'Resources loaded over http:// are blocked by browsers on https:// pages. The deploy ' +
        'pipeline can auto-rewrite where the host supports https — fix in source for clarity.',
      location: path,
    });
  }
}

function scanForExternalScripts(
  path: string,
  body: string,
  findings: SecurityFinding[],
  appHost: string | null,
): void {
  if (!path.endsWith('.html') && !path.endsWith('.htm')) return;
  EXTERNAL_SCRIPT_RE.lastIndex = 0;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = EXTERNAL_SCRIPT_RE.exec(body))) {
    const src = match[1] ?? '';
    if (!/^https?:\/\//i.test(src)) continue; // relative — same origin
    let host: string;
    try {
      host = new URL(src).host;
    } catch {
      continue;
    }
    if (appHost && host === appHost) continue;
    if (TRUSTED_SCRIPT_HOSTS.has(host)) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    findings.push({
      rule: 'external_script_unknown_host',
      severity: 'warn',
      title: `External script from ${host}`,
      reason:
        'Shippie apps run on user devices — external scripts add a third-party trust dependency ' +
        'and break offline support. Self-host the script (the deploy pipeline can fetch + bundle ' +
        'in Phase 4) or remove if unnecessary.',
      location: path,
      snippet: src,
    });
  }
}

/**
 * Run the security scan over an extracted file tree.
 *
 * @param files  The same Map<path, bytes> shape used elsewhere in the
 *               deploy pipeline.
 * @param appHost Optional same-origin host (e.g. `slug.shippie.app`) to
 *               suppress "external script" flags when the maker references
 *               their own deployed bundle.
 */
export function runSecurityScan(
  files: ReadonlyMap<string, Uint8Array>,
  appHost: string | null = null,
): SecurityScanReport {
  const findings: SecurityFinding[] = [];
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
    scanForSecrets(path, body, findings);
    scanForInlineHandlers(path, body, findings);
    scanForMixedContent(path, body, findings);
    scanForExternalScripts(path, body, findings, appHost);
  }

  let blocks = 0;
  let warns = 0;
  let infos = 0;
  for (const f of findings) {
    if (f.severity === 'block') blocks++;
    else if (f.severity === 'warn') warns++;
    else infos++;
  }

  return { findings, blocks, warns, infos, scannedFiles: scanned };
}
