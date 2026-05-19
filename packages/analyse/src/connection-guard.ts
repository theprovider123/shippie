/**
 * Connection Guard.
 *
 * Turns a static app bundle into an enforceable outbound-connection policy:
 * what hosts are contacted, what browser surface uses them, and which
 * hosts should be allowed by CSP. This complements Local Tool policy:
 * Local Tool answers "is this app allowed to ship?", Connection Guard
 * answers "what should the runtime permit and disclose?". Shippie is open:
 * non-tracking external services are allowed by default and made visible.
 */

import { classifyDomain, type DomainCategory } from './privacy-audit.ts';

export const CONNECTION_GUARD_SCHEMA = 'shippie.connection-guard.v1' as const;

export type ConnectionDestination =
  | 'connect'
  | 'script'
  | 'style'
  | 'font'
  | 'image'
  | 'frame'
  | 'worker'
  | 'manifest'
  | 'unknown';

export type ConnectionRisk = 'low' | 'medium' | 'high';
export type ConnectionGuardSeverity = 'block' | 'warn' | 'info';

export interface ConnectionGuardFinding {
  id: string;
  severity: ConnectionGuardSeverity;
  title: string;
  detail: string;
  location: string;
  host?: string;
  snippet?: string;
}

export interface ConnectionGuardConnection {
  host: string;
  protocol: 'http:' | 'https:' | 'ws:' | 'wss:';
  category: DomainCategory | 'external-ai' | 'external-script';
  reason: string;
  destinations: ConnectionDestination[];
  methods: string[];
  occurrences: number;
  files: string[];
  risk: ConnectionRisk;
  requiresConsent: boolean;
  data: string[];
  purpose: string;
}

export interface ConnectionGuardCspPolicy {
  connectSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  fontSrc: string[];
  imgSrc: string[];
  frameSrc: string[];
  workerSrc: string[];
  manifestSrc: string[];
}

export interface ConnectionGuardReport {
  schema: typeof CONNECTION_GUARD_SCHEMA;
  passed: boolean;
  summary: string;
  scannedFiles: number;
  findings: ConnectionGuardFinding[];
  blocks: number;
  warns: number;
  infos: number;
  connections: ConnectionGuardConnection[];
  csp: ConnectionGuardCspPolicy;
}

export interface ConnectionGuardOptions {
  appHost?: string | null;
  declaredConnectDomains?: ReadonlyArray<string>;
  declaredResourceDomains?: ReadonlyArray<string>;
}

interface Bucket {
  host: string;
  protocol: ConnectionGuardConnection['protocol'];
  category: ConnectionGuardConnection['category'];
  reason: string;
  destinations: Set<ConnectionDestination>;
  methods: Set<string>;
  files: Set<string>;
  occurrences: number;
}

interface UrlEvidence {
  url: URL;
  raw: string;
  index: number;
  destination: ConnectionDestination;
  method: string;
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
  '.css',
  '.json',
  '.svg',
]);

const ABSOLUTE_URL_RE = /\b(?:https?|wss?):\/\/[^\s"'`)<>\\]+/gi;
const FETCH_LITERAL_RE =
  /\bfetch\s*\(\s*([`'"])((?:https?|wss?):\/\/[^`'"]+)\1\s*(?:,\s*(\{[\s\S]{0,700}?\}))?\s*\)/gi;
const BEACON_LITERAL_RE =
  /\bnavigator\.sendBeacon\s*\(\s*([`'"])((?:https?|wss?):\/\/[^`'"]+)\1/gi;
const WEBSOCKET_LITERAL_RE =
  /\bnew\s+WebSocket\s*\(\s*([`'"])((?:wss?|https?):\/\/[^`'"]+)\1/gi;
const EVENTSOURCE_LITERAL_RE =
  /\bnew\s+EventSource\s*\(\s*([`'"])((?:https?):\/\/[^`'"]+)\1/gi;
const METHOD_RE = /\bmethod\s*:\s*([`'"])(GET|HEAD|POST|PUT|PATCH|DELETE)\1/i;
const SHIPPIE_HOST_RE = /(^|\.)shippie\.(?:app|dev)$/i;
const EXTERNAL_AI_HOST_RE =
  /(^|\.)((api\.openai\.com)|(api\.anthropic\.com)|(generativelanguage\.googleapis\.com)|(api\.mistral\.ai)|(api\.groq\.com))$/i;

export function runConnectionGuardScan(
  files: ReadonlyMap<string, Uint8Array>,
  opts: ConnectionGuardOptions = {},
): ConnectionGuardReport {
  const buckets = new Map<string, Bucket>();
  const findings: ConnectionGuardFinding[] = [];
  let scannedFiles = 0;

  for (const [path, bytes] of files) {
    if (!shouldScan(path)) continue;
    scannedFiles += 1;
    const body = decoder.decode(bytes);
    const seenAt = new Set<number>();

    for (const evidence of literalNetworkEvidence(body)) {
      seenAt.add(evidence.index);
      recordEvidence(path, body, evidence, buckets, findings, opts);
    }

    ABSOLUTE_URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ABSOLUTE_URL_RE.exec(body))) {
      if (seenAt.has(match.index)) continue;
      const raw = cleanRawUrl(match[0] ?? '');
      const url = parseUrl(raw);
      if (!url) continue;
      if (shouldIgnoreUrlReference(body, match.index)) continue;
      const evidence: UrlEvidence = {
        url,
        raw,
        index: match.index,
        destination: inferDestination(path, body, match.index, url),
        method: 'GET',
      };
      recordEvidence(path, body, evidence, buckets, findings, opts);
    }
  }

  for (const bucket of buckets.values()) {
    addBucketFindings(bucket, findings);
  }

  const connections = [...buckets.values()].map(connectionFromBucket).sort((a, b) => {
    const riskOrder: Record<ConnectionRisk, number> = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.risk] !== riskOrder[b.risk]
      ? riskOrder[a.risk] - riskOrder[b.risk]
      : a.host.localeCompare(b.host);
  });
  const csp = buildCspPolicy(connections, opts);
  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const infos = findings.filter((f) => f.severity === 'info').length;

  return {
    schema: CONNECTION_GUARD_SCHEMA,
    passed: blocks === 0,
    summary: summarize(blocks, warns, connections.length),
    scannedFiles,
    findings,
    blocks,
    warns,
    infos,
    connections,
    csp,
  };
}

function literalNetworkEvidence(body: string): UrlEvidence[] {
  const out: UrlEvidence[] = [];
  collectLiteral(FETCH_LITERAL_RE, body, out, 'connect', (match) => {
    const options = match[3] ?? '';
    return METHOD_RE.exec(options)?.[2]?.toUpperCase() ?? 'GET';
  });
  collectLiteral(BEACON_LITERAL_RE, body, out, 'connect', () => 'POST');
  collectLiteral(WEBSOCKET_LITERAL_RE, body, out, 'connect', () => 'GET');
  collectLiteral(EVENTSOURCE_LITERAL_RE, body, out, 'connect', () => 'GET');
  return out;
}

function collectLiteral(
  re: RegExp,
  body: string,
  out: UrlEvidence[],
  destination: ConnectionDestination,
  methodFor: (match: RegExpExecArray) => string,
): void {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const raw = cleanRawUrl(match[2] ?? '');
    const url = parseUrl(raw);
    if (!url) continue;
    const urlIndex = match.index + Math.max(0, match[0].indexOf(match[2] ?? raw));
    out.push({
      url,
      raw,
      index: urlIndex,
      destination,
      method: methodFor(match),
    });
  }
}

function recordEvidence(
  path: string,
  body: string,
  evidence: UrlEvidence,
  buckets: Map<string, Bucket>,
  findings: ConnectionGuardFinding[],
  opts: ConnectionGuardOptions,
): void {
  if (isLocalUrl(evidence.url, opts.appHost)) return;
  const host = evidence.url.hostname.toLowerCase();
  const key = `${evidence.url.protocol}//${host}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    const category = categoryFor(evidence.url);
    bucket = {
      host,
      protocol: evidence.url.protocol as Bucket['protocol'],
      category: category.category,
      reason: category.reason,
      destinations: new Set(),
      methods: new Set(),
      files: new Set(),
      occurrences: 0,
    };
    buckets.set(key, bucket);
  }
  bucket.occurrences += 1;
  bucket.destinations.add(evidence.destination);
  bucket.methods.add(evidence.method);
  bucket.files.add(path);

  if (evidence.url.protocol === 'http:' || evidence.url.protocol === 'ws:') {
    findings.push({
      id: 'insecure-connection',
      severity: 'block',
      title: `Insecure connection to ${host}`,
      detail: 'Shippie apps may not load or send data over plaintext HTTP/WebSocket.',
      location: `${path}:${lineForOffset(body, evidence.index)}`,
      host,
      snippet: trimSnippet(evidence.raw),
    });
  }
}

function addBucketFindings(bucket: Bucket, findings: ConnectionGuardFinding[]): void {
  const location = bucket.files.values().next().value ?? 'unknown';
  const methods = [...bucket.methods];
  const writes = methods.some((m) => !['GET', 'HEAD'].includes(m));

  if (bucket.category === 'external-ai') {
    findings.push({
      id: 'external-ai-provider',
      severity: 'warn',
      title: `External AI provider: ${bucket.host}`,
      detail:
        'External AI can receive large amounts of user context. Shippie allows this, marks it high risk, and shows users a clear connection notice.',
      location,
      host: bucket.host,
    });
  }

  if (bucket.category === 'tracker') {
    findings.push({
      id: 'tracker-domain',
      severity: 'block',
      title: `Tracker or analytics host: ${bucket.host}`,
      detail: 'Third-party tracking conflicts with Shippie private-by-default apps.',
      location,
      host: bucket.host,
    });
  }

  if (bucket.destinations.has('script') && bucket.category !== 'shippie') {
    findings.push({
      id: 'external-script',
      severity: 'warn',
      title: `External script host: ${bucket.host}`,
      detail:
        'Third-party scripts can read page state. Shippie allows them for creative freedom, but users will see this as a high-risk connection.',
      location,
      host: bucket.host,
    });
  }

  if (writes && bucket.category !== 'shippie') {
    findings.push({
      id: 'external-write',
      severity: 'warn',
      title: `External write to ${bucket.host}`,
      detail:
        'External writes can move user data out of Shippie. Shippie allows them when visible, and marks this host high risk for users.',
      location,
      host: bucket.host,
    });
  }

  if (bucket.category === 'unknown') {
    findings.push({
      id: 'unknown-host',
      severity: 'warn',
      title: `Undeclared external host: ${bucket.host}`,
      detail:
        'Declare this host with a purpose and data category, or remove it. Shippie will still enforce a narrow CSP for detected browser surfaces.',
      location,
      host: bucket.host,
    });
  }
}

function connectionFromBucket(bucket: Bucket): ConnectionGuardConnection {
  const destinations = [...bucket.destinations].sort() as ConnectionDestination[];
  const methods = [...bucket.methods].sort();
  const writes = methods.some((m) => !['GET', 'HEAD'].includes(m));
  const risk = riskFor(bucket, writes);
  return {
    host: bucket.host,
    protocol: bucket.protocol,
    category: bucket.category,
    reason: bucket.reason,
    destinations,
    methods,
    occurrences: bucket.occurrences,
    files: [...bucket.files].slice(0, 5).sort(),
    risk,
    requiresConsent: risk === 'high',
    data: dataCategories(bucket, writes),
    purpose: purposeFor(bucket),
  };
}

function buildCspPolicy(
  connections: ConnectionGuardConnection[],
  opts: ConnectionGuardOptions,
): ConnectionGuardCspPolicy {
  const policy: ConnectionGuardCspPolicy = {
    connectSrc: [],
    scriptSrc: [],
    styleSrc: [],
    fontSrc: [],
    imgSrc: [],
    frameSrc: [],
    workerSrc: [],
    manifestSrc: [],
  };

  for (const c of connections) {
    if (c.protocol !== 'https:' && c.protocol !== 'wss:') continue;
    if (c.category === 'tracker') continue;
    const source = sourceFor(c);
    for (const destination of c.destinations) {
      switch (destination) {
        case 'connect':
          policy.connectSrc.push(source);
          break;
        case 'style':
          policy.styleSrc.push(source);
          break;
        case 'font':
          policy.fontSrc.push(source);
          break;
        case 'image':
          policy.imgSrc.push(source);
          break;
        case 'frame':
          policy.frameSrc.push(source);
          break;
        case 'worker':
          policy.workerSrc.push(source);
          break;
        case 'manifest':
          policy.manifestSrc.push(source);
          break;
        case 'script':
          policy.scriptSrc.push(source);
          break;
        case 'unknown':
          break;
      }
    }
  }

  policy.connectSrc.push(...(opts.declaredConnectDomains ?? []).map(formatSource));
  policy.imgSrc.push(...(opts.declaredResourceDomains ?? []).map(formatSource));

  return {
    connectSrc: unique(policy.connectSrc),
    scriptSrc: unique(policy.scriptSrc),
    styleSrc: unique(policy.styleSrc),
    fontSrc: unique(policy.fontSrc),
    imgSrc: unique(policy.imgSrc),
    frameSrc: unique(policy.frameSrc),
    workerSrc: unique(policy.workerSrc),
    manifestSrc: unique(policy.manifestSrc),
  };
}

function categoryFor(url: URL): Pick<Bucket, 'category' | 'reason'> {
  if (SHIPPIE_HOST_RE.test(url.hostname)) return { category: 'shippie', reason: 'shippie infra' };
  if (EXTERNAL_AI_HOST_RE.test(url.hostname)) {
    return { category: 'external-ai', reason: 'known external AI provider' };
  }
  const classified = classifyDomain(url.hostname);
  return { category: classified.category, reason: classified.reason };
}

function riskFor(bucket: Bucket, writes: boolean): ConnectionRisk {
  if (
    writes ||
    bucket.category === 'tracker' ||
    bucket.category === 'external-ai' ||
    (bucket.destinations.has('script') && bucket.category !== 'shippie')
  ) {
    return 'high';
  }
  if (bucket.category === 'unknown' || bucket.destinations.has('connect')) return 'medium';
  return 'low';
}

function dataCategories(bucket: Bucket, writes: boolean): string[] {
  if (bucket.category === 'external-ai') return ['text', 'images', 'files', 'personal_context'];
  if (bucket.category === 'tracker') return ['usage', 'device', 'page_view'];
  if (writes) return ['user_data'];
  if (bucket.destinations.has('connect')) return ['reference_query'];
  if (bucket.destinations.has('font') || bucket.destinations.has('style')) return ['asset_request'];
  if (bucket.destinations.has('image')) return ['asset_request'];
  return ['network_request'];
}

function purposeFor(bucket: Bucket): string {
  if (bucket.category === 'shippie') return 'Shippie platform service';
  if (bucket.category === 'cdn') return 'External asset delivery';
  if (bucket.category === 'feature') return 'Declared feature data';
  if (bucket.category === 'tracker') return 'Tracking or analytics';
  if (bucket.category === 'external-ai') return 'External AI processing';
  if (bucket.destinations.has('font') || bucket.destinations.has('style')) return 'Fonts or styles';
  if (bucket.destinations.has('image')) return 'External media';
  if (bucket.destinations.has('connect')) return 'Reference data request';
  return 'External connection';
}

function inferDestination(path: string, body: string, index: number, url: URL): ConnectionDestination {
  const before = body.slice(Math.max(0, index - 220), index);
  const after = body.slice(index, Math.min(body.length, index + 180));
  const context = `${before}${after}`;
  const ext = url.pathname.toLowerCase();
  const pathExt = fileExtension(path);

  if (/\b(?:fetch|sendBeacon|EventSource|WebSocket)\s*\([^)]*$/i.test(before)) return 'connect';
  if (/\b(?:api|endpoint|url|href)\s*=\s*['"]?$/i.test(before) && /\bfetch\s*\(/i.test(body)) return 'connect';
  if (/<script\b[^>]*\bsrc\s*=\s*["'][^"']*$/i.test(before)) return 'script';
  if (/<iframe\b[^>]*\bsrc\s*=\s*["'][^"']*$/i.test(before)) return 'frame';
  if (/<link\b[^>]*\brel\s*=\s*["'][^"']*manifest/i.test(context)) return 'manifest';
  if (/<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet/i.test(context)) return 'style';
  if (/<img\b[^>]*\bsrc(?:set)?\s*=\s*["'][^"']*$/i.test(before)) return 'image';
  if (/\bnew\s+Worker\s*\([^)]*$/i.test(before)) return 'worker';
  if (/\.(?:woff2?|ttf|otf|eot)(?:$|[?#])/i.test(ext)) return 'font';
  if (/\.(?:png|jpe?g|webp|gif|svg|ico|avif)(?:$|[?#])/i.test(ext)) return 'image';
  if (/\.(?:css)(?:$|[?#])/i.test(ext)) return 'style';
  if (/\.(?:js|mjs)(?:$|[?#])/i.test(ext)) return 'script';
  if (pathExt === '.css' && /@font-face[^}]*$/i.test(before.slice(-500))) return 'font';
  if (pathExt === '.css' && /url\s*\(\s*['"]?$/i.test(before)) return 'image';
  return 'unknown';
}

function shouldIgnoreUrlReference(body: string, index: number): boolean {
  const prefix = body.slice(Math.max(0, index - 120), index);
  if (/\$\{/.test(body.slice(index, index + 80))) return true;
  return /["'](?:\$schema|source_repo|sourceRepo|repository|homepage|license_url|licenseUrl|documentation|docs)["']\s*:\s*["']?$/i.test(
    prefix,
  );
}

function cleanRawUrl(raw: string): string {
  return raw.replace(/[),.;\]]+$/g, '');
}

function parseUrl(raw: string): URL | null {
  if (!raw || raw.includes('${')) return null;
  try {
    const url = new URL(raw);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isLocalUrl(url: URL, appHost?: string | null): boolean {
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  if (appHost && url.hostname === appHost) return true;
  return false;
}

function sourceFor(connection: ConnectionGuardConnection): string {
  const scheme = connection.protocol === 'wss:' ? 'wss' : 'https';
  return `${scheme}://${connection.host}`;
}

function formatSource(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) return '';
  if (/^(?:https?|wss?):\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function shouldScan(path: string): boolean {
  return SCANNABLE_EXTENSIONS.has(fileExtension(path));
}

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function summarize(blocks: number, warns: number, connections: number): string {
  if (blocks > 0) {
    return `${blocks} unsafe connection${blocks === 1 ? '' : 's'} blocked before deploy.`;
  }
  if (connections > 0) {
    return `${connections} outbound host${connections === 1 ? '' : 's'} disclosed and constrained by Connection Guard${warns ? ` (${warns} review warning${warns === 1 ? '' : 's'})` : ''}.`;
  }
  return 'No external connections detected. App remains device-local by default.';
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
