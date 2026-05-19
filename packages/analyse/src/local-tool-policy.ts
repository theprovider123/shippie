/**
 * Local Tool policy scan.
 *
 * This is the build-time guardrail for the Shippie promise:
 * user data stays on the device unless the user explicitly exports it,
 * enables encrypted Shippie backup, or joins an encrypted Shippie relay.
 *
 * The scanner is intentionally conservative. It is not a full data-flow
 * verifier; it catches common cloud/storage/auth/tracking patterns before a
 * bundle can enter the marketplace and gives makers conversion guidance.
 */

export type LocalToolEligibilityStatus =
  | 'eligible-local'
  | 'eligible-reference-network'
  | 'needs-conversion';

export type LocalToolFindingSeverity = 'block' | 'warn' | 'info';

export type LocalToolFindingCategory =
  | 'third-party-storage'
  | 'third-party-auth'
  | 'analytics'
  | 'ads'
  | 'external-write'
  | 'external-ai'
  | 'reference-data'
  | 'query-risk'
  | 'private-relay'
  | 'local-capability';

export interface LocalToolFinding {
  id: string;
  severity: LocalToolFindingSeverity;
  category: LocalToolFindingCategory;
  title: string;
  detail: string;
  location: string;
  snippet?: string;
}

export interface LocalToolCapabilityHints {
  worksOffline: boolean;
  secureBackup: boolean;
  referenceData: { domains: string[] };
  localAi: boolean;
  privateRelay: boolean;
  sharesIntents: boolean;
  localDb: boolean;
  localFiles: boolean;
}

export interface LocalToolPolicyReport {
  passed: boolean;
  status: LocalToolEligibilityStatus;
  findings: LocalToolFinding[];
  blocks: number;
  warns: number;
  infos: number;
  scannedFiles: number;
  referenceDomains: string[];
  capabilityHints: LocalToolCapabilityHints;
  summary: string;
}

interface PatternRule {
  id: string;
  category: LocalToolFindingCategory;
  title: string;
  detail: string;
  severity: LocalToolFindingSeverity;
  patterns: RegExp[];
}

const decoder = new TextDecoder('utf-8', { fatal: false });

const SCANNABLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.svelte',
  '.vue',
  '.html',
  '.htm',
  '.json',
  '.css',
  '.md',
  '.txt',
]);

const BLOCKED_RULES: PatternRule[] = [
  {
    id: 'cloud-storage-supabase',
    category: 'third-party-storage',
    severity: 'block',
    title: 'Supabase client detected',
    detail:
      'Shippie tools store user data locally. Replace Supabase tables with shippie.local.db and encrypted Shippie backup if the user wants continuity.',
    patterns: [/@supabase\/supabase-js\b/i, /\bsupabase\.from\s*\(/i, /\bsupabase\.storage\b/i],
  },
  {
    id: 'cloud-storage-firebase',
    category: 'third-party-storage',
    severity: 'block',
    title: 'Firebase or Firestore detected',
    detail:
      'Firebase stores user data and identity outside the device. Use shippie.local.db, shippie.local.files, and Shippie intents instead.',
    patterns: [
      /\bfirebase\/(?:app|firestore|database|storage|auth)\b/i,
      /\bgetFirestore\s*\(/i,
      /\bgetDatabase\s*\(/i,
      /\bgetStorage\s*\(/i,
    ],
  },
  {
    id: 'cloud-storage-appwrite-pocketbase',
    category: 'third-party-storage',
    severity: 'block',
    title: 'Third-party backend client detected',
    detail:
      'Appwrite, PocketBase, and similar hosted backends make the app a cloud app. Shippie marketplace tools need a local data path.',
    patterns: [/\bappwrite\b/i, /\bpocketbase\b/i, /@neondatabase\/serverless\b/i, /@planetscale\/database\b/i],
  },
  {
    id: 'third-party-auth',
    category: 'third-party-auth',
    severity: 'block',
    title: 'Third-party auth detected',
    detail:
      'Marketplace tools cannot require an external login. Use local state by default; Shippie backup is optional and user controlled.',
    patterns: [
      /\bnext-auth\b/i,
      /@clerk\//i,
      /@auth0\//i,
      /\bfirebase\/auth\b/i,
      /\bsupabase\.auth\b/i,
      /\bsignInWith(?:Popup|Redirect|EmailAndPassword)\b/i,
    ],
  },
  {
    id: 'analytics-tracker',
    category: 'analytics',
    severity: 'block',
    title: 'Third-party analytics or tracking detected',
    detail:
      'Shippie tools do not ship third-party tracking. Use Shippie proof events or local-only diagnostics instead.',
    patterns: [
      /\bgtag\s*\(/i,
      /\bdataLayer\b/i,
      /googletagmanager\.com/i,
      /google-analytics\.com/i,
      /\bmixpanel(?:-browser)?\b/i,
      /\bposthog-js\b/i,
      /@segment\/analytics/i,
      /\bamplitude-js\b/i,
      /\bfbq\s*\(/i,
      /connect\.facebook\.net\/.*\/fbevents\.js/i,
    ],
  },
  {
    id: 'ad-sdk',
    category: 'ads',
    severity: 'block',
    title: 'Ad network code detected',
    detail:
      'Ads and ad SDKs conflict with the private tool promise. Remove the ad library before deploying to Shippie.',
    patterns: [/adsbygoogle/i, /googlesyndication\.com/i, /doubleclick\.net/i, /adservice\.google\./i],
  },
  {
    id: 'external-llm-silent',
    category: 'external-ai',
    severity: 'block',
    title: 'External AI endpoint detected',
    detail:
      'External LLM calls may only happen after a clear per-call user action. Prefer shippie.local.ai for local inference; otherwise label the action as sending data to the provider.',
    patterns: [
      /api\.openai\.com\/v1/i,
      /api\.anthropic\.com/i,
      /generativelanguage\.googleapis\.com/i,
      /api\.mistral\.ai/i,
      /api\.groq\.com/i,
    ],
  },
];

const SHIPPIE_HOST_RE = /(^|\.)shippie\.app$/i;
const SHIPPIE_PATH_RE = /\/__shippie\/(?:signal|relay|backup|intent|proof|meta|sdk|sw|local)\b/i;
const EXTERNAL_URL_RE = /https:\/\/[^\s"'`)<>]+/gi;
const FETCH_RE =
  /\bfetch\s*\(\s*([`'"])(https:\/\/[^`'"]+)\1\s*(?:,\s*(\{[\s\S]{0,700}?\}))?\s*\)/gi;
const METHOD_RE = /\bmethod\s*:\s*([`'"])(POST|PUT|PATCH|DELETE)\1/i;
const QUERY_RISK_RE = /[?&](?:q|query|search|prompt|text|message|note|email|name|user|description)=/i;

export function runLocalToolPolicyScan(files: ReadonlyMap<string, Uint8Array>): LocalToolPolicyReport {
  const findings: LocalToolFinding[] = [];
  const referenceDomains = new Set<string>();
  const hints: LocalToolCapabilityHints = {
    worksOffline: false,
    secureBackup: false,
    referenceData: { domains: [] },
    localAi: false,
    privateRelay: false,
    sharesIntents: false,
    localDb: false,
    localFiles: false,
  };
  let scannedFiles = 0;

  for (const [path, bytes] of files) {
    if (!shouldScan(path)) continue;
    scannedFiles += 1;
    const body = decoder.decode(bytes);
    scanPatternRules(path, body, findings);
    scanCapabilities(body, hints);
    scanExternalNetwork(path, body, findings, referenceDomains, hints);
  }

  hints.referenceData.domains = [...referenceDomains].sort();
  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  const status: LocalToolEligibilityStatus =
    blocks > 0
      ? 'needs-conversion'
      : referenceDomains.size > 0
        ? 'eligible-reference-network'
        : 'eligible-local';

  return {
    passed: blocks === 0,
    status,
    findings,
    blocks,
    warns,
    infos,
    scannedFiles,
    referenceDomains: [...referenceDomains].sort(),
    capabilityHints: hints,
    summary: summarize(status, blocks, warns, referenceDomains.size),
  };
}

function shouldScan(path: string): boolean {
  return SCANNABLE_EXTENSIONS.has(fileExtension(path));
}

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot).toLowerCase();
}

function scanPatternRules(path: string, body: string, findings: LocalToolFinding[]): void {
  for (const rule of BLOCKED_RULES) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(body);
      if (!match) continue;
      findings.push({
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail,
        location: `${path}:${lineForOffset(body, match.index)}`,
        snippet: trimSnippet(match[0]),
      });
      break;
    }
  }
}

function scanCapabilities(body: string, hints: LocalToolCapabilityHints): void {
  hints.localDb ||= /shippie\.local\.db|@shippie\/local-db|indexedDB|localStorage/i.test(body);
  hints.localFiles ||= /shippie\.local\.files|@shippie\/local-files|getDirectory\s*\(/i.test(body);
  hints.localAi ||= /shippie\.local\.ai|@shippie\/local-ai|task:\s*['"](?:classify|embed|sentiment|moderate)['"]/i.test(body);
  hints.secureBackup ||= /shippie\.backup|data\.mode\s*[:=]\s*['"]shippie-documents|recovery\s*[:=]\s*['"]inherited/i.test(body);
  hints.privateRelay ||= /__shippie\/(?:signal|relay)|shippie\.local\.group|@shippie\/proximity|createGroup\s*\(|joinGroup\s*\(/i.test(body);
  hints.sharesIntents ||= /shippie\.intent|intent\.(?:provide|consume|broadcast)|intents\s*[:=]/i.test(body);
  hints.worksOffline ||= /serviceWorker|caches\.open|navigator\.storage|getDirectory\s*\(|localStorage|indexedDB|shippie\.local/i.test(body);
}

function scanExternalNetwork(
  path: string,
  body: string,
  findings: LocalToolFinding[],
  referenceDomains: Set<string>,
  hints: LocalToolCapabilityHints,
): void {
  FETCH_RE.lastIndex = 0;
  let fetchMatch: RegExpExecArray | null;
  while ((fetchMatch = FETCH_RE.exec(body))) {
    const rawUrl = fetchMatch[2] ?? '';
    const options = fetchMatch[3] ?? '';
    const url = parseHttpsUrl(rawUrl);
    if (!url) continue;
    const location = `${path}:${lineForOffset(body, fetchMatch.index)}`;
    if (isAllowedShippieUrl(url)) {
      if (SHIPPIE_PATH_RE.test(url.pathname)) hints.privateRelay = true;
      continue;
    }
    const method = METHOD_RE.exec(options)?.[2]?.toUpperCase() ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      findings.push({
        id: 'external-user-data-write',
        category: 'external-write',
        severity: 'block',
        title: `External ${method} request to ${url.hostname}`,
        detail:
          'Shippie tools may fetch public reference data, but user data must not be posted to external services. Use shippie.local.db or a visible user export instead.',
        location,
        snippet: trimSnippet(rawUrl),
      });
      continue;
    }
    referenceDomains.add(url.hostname);
    if (QUERY_RISK_RE.test(url.search)) {
      findings.push({
        id: 'reference-query-risk',
        category: 'query-risk',
        severity: 'warn',
        title: `Potentially personal query sent to ${url.hostname}`,
        detail:
          'GET is not automatically private. Reference APIs should receive category/search terms only, not names, notes, prompts, emails, or personal context.',
        location,
        snippet: trimSnippet(rawUrl),
      });
    }
  }

  EXTERNAL_URL_RE.lastIndex = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = EXTERNAL_URL_RE.exec(body))) {
    const url = parseHttpsUrl(urlMatch[0] ?? '');
    if (!url || isAllowedShippieUrl(url)) continue;
    if (isStaticAssetUrl(url)) continue;
    if (isLikelyAlreadyRecordedFetch(body, urlMatch.index)) continue;
    referenceDomains.add(url.hostname);
  }
}

function parseHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isAllowedShippieUrl(url: URL): boolean {
  return SHIPPIE_HOST_RE.test(url.hostname) || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function isStaticAssetUrl(url: URL): boolean {
  return /\.(?:png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|otf|css|js|mjs)$/i.test(url.pathname);
}

function isLikelyAlreadyRecordedFetch(body: string, index: number): boolean {
  const window = body.slice(Math.max(0, index - 20), index + 20);
  return /\bfetch\s*\(/i.test(window);
}

function summarize(
  status: LocalToolEligibilityStatus,
  blocks: number,
  warns: number,
  referenceDomainCount: number,
): string {
  if (status === 'needs-conversion') {
    return `${blocks} local-tool blocker${blocks === 1 ? '' : 's'} found. Convert external storage/auth/tracking to Shippie local primitives before publishing.`;
  }
  if (status === 'eligible-reference-network') {
    return `Eligible local tool with ${referenceDomainCount} declared reference-data domain${referenceDomainCount === 1 ? '' : 's'}${warns ? ` and ${warns} review warning${warns === 1 ? '' : 's'}` : ''}.`;
  }
  return 'Eligible local tool. No third-party user-data egress detected.';
}

function lineForOffset(body: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (body.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function trimSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
