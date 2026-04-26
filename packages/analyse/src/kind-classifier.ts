/**
 * App-kind classifier — Local / Connected / Cloud detection from a
 * deployed app's source/bundle. Vocabulary doc: `docs/app-kinds.md`.
 *
 * Pure regex-only scan over JS/TS files. Returns a detection result;
 * the platform combines this with maker declaration and proof events
 * to produce the public label.
 *
 * Decision rule:
 *   - Any backend provider OR server-route signal → 'cloud'
 *   - Else any non-Shippie outbound URL literal       → 'connected'
 *   - Else                                            → 'local'
 */

const decoder = new TextDecoder();

export type AppKind = 'local' | 'connected' | 'cloud';

export interface AppKindLocalization {
  candidate: boolean;
  blockers: string[];
  supportedTransforms: string[];
}

export interface AppKindDetection {
  detectedKind: AppKind;
  confidence: number;
  reasons: string[];
  externalDomains: string[];
  backendProviders: string[];
  localSignals: string[];
  localization: AppKindLocalization;
}

interface ProviderRule {
  pattern: RegExp;
  provider: string;
  transform?: string;
  blocker?: string;
}

const CLOUD_PROVIDERS: ProviderRule[] = [
  { pattern: /@supabase\/supabase-js/, provider: 'supabase', transform: 'supabase-basic-queries' },
  { pattern: /@supabase\/ssr/, provider: 'supabase-ssr', blocker: 'server-side-supabase-client' },
  { pattern: /firebase\/firestore/, provider: 'firebase-firestore', transform: 'firebase-firestore-basic' },
  { pattern: /firebase\/auth/, provider: 'firebase-auth', transform: 'authjs-to-local-identity' },
  { pattern: /firebase\/storage/, provider: 'firebase-storage' },
  { pattern: /(?:^|[^a-z])next-auth/, provider: 'next-auth', transform: 'authjs-to-local-identity' },
  { pattern: /@auth\/(?:core|sveltekit|nextjs)/, provider: 'authjs', transform: 'authjs-to-local-identity' },
  { pattern: /@vercel\/postgres/, provider: 'vercel-postgres', blocker: 'vercel-postgres' },
  { pattern: /@neondatabase\/serverless/, provider: 'neon', blocker: 'neon-serverless' },
  { pattern: /@planetscale\/database/, provider: 'planetscale', blocker: 'planetscale' },
];

interface SupabaseBlocker {
  pattern: RegExp;
  blocker: string;
}

const SUPABASE_BLOCKERS: SupabaseBlocker[] = [
  { pattern: /\.rpc\s*\(/, blocker: 'uses-supabase-rpc' },
  { pattern: /\.channel\s*\(/, blocker: 'uses-supabase-realtime' },
  { pattern: /\.subscribe\s*\(\s*\)/, blocker: 'uses-supabase-realtime' },
  { pattern: /createServerClient/, blocker: 'server-side-supabase-client' },
];

interface ServerRule {
  pattern: RegExp;
  provider: string;
}

const SERVER_RULES: ServerRule[] = [
  { pattern: /['"]use server['"]/, provider: 'rsc-server-action' },
  { pattern: /export\s+const\s+actions\s*[:=]/, provider: 'sveltekit-actions' },
  { pattern: /export\s+(?:const|async\s+function)\s+(?:GET|POST|PUT|PATCH|DELETE)\b/, provider: 'sveltekit-or-nextjs-server-route' },
];

/**
 * "Connected via Shippie infra" markers — apps using Shippie's proximity
 * / signalling primitives need the SignalRoom DO to coordinate peers.
 * Personal data still lives on each device, but the multi-peer flow
 * doesn't work offline, so per the App Kinds definition these are
 * Connected, not Local.
 */
interface ShippieConnectedRule {
  pattern: RegExp;
  signal: string;
}

const SHIPPIE_CONNECTED_RULES: ShippieConnectedRule[] = [
  { pattern: /@shippie\/proximity/, signal: 'shippie-proximity' },
  { pattern: /\bcreateGroup\s*\(/, signal: 'shippie-create-group' },
  { pattern: /\bjoinGroup\s*\(/, signal: 'shippie-join-group' },
];

interface LocalSignalRule {
  pattern: RegExp;
  signal: string;
}

const LOCAL_SIGNALS: LocalSignalRule[] = [
  { pattern: /navigator\.serviceWorker\.register/, signal: 'service-worker' },
  { pattern: /\bindexedDB\b|window\.indexedDB|self\.indexedDB/, signal: 'indexeddb' },
  { pattern: /navigator\.storage\.getDirectory/, signal: 'opfs' },
  { pattern: /@vlcn\.io\/wa-sqlite-wasm|@sqlite\.org\/sqlite-wasm|wa-sqlite/, signal: 'sqlite-wasm' },
  { pattern: /(?:^|[^a-z])dexie(?:[^a-z]|$)/i, signal: 'dexie' },
  { pattern: /(?:^|[^a-z])pouchdb(?:[^a-z]|$)/i, signal: 'pouchdb' },
  { pattern: /@shippie\/sdk/, signal: 'shippie-sdk' },
  { pattern: /\blocalStorage\b/, signal: 'localstorage' },
];

const URL_LITERAL = /['"`](https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^'"`\s]*)?)['"`]/gi;

const SHIPPIE_HOST_SUFFIXES = [
  'shippie.app',
  'shippie.dev',
];

function isShippieHost(host: string): boolean {
  for (const suffix of SHIPPIE_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith('.' + suffix)) return true;
  }
  return false;
}

function shouldScanFile(path: string): boolean {
  return (
    path.endsWith('.js') ||
    path.endsWith('.mjs') ||
    path.endsWith('.cjs') ||
    path.endsWith('.ts') ||
    path.endsWith('.tsx') ||
    path.endsWith('.jsx')
  );
}

export function classifyKind(files: ReadonlyMap<string, Uint8Array>): AppKindDetection {
  let combined = '';
  let scannedBytes = 0;
  let totalBytes = 0;

  for (const [path, bytes] of files) {
    totalBytes += bytes.byteLength;
    if (shouldScanFile(path)) {
      combined += decoder.decode(bytes) + '\n';
      scannedBytes += bytes.byteLength;
    }
  }

  const reasons: string[] = [];
  const backendProviders = new Set<string>();
  const blockers = new Set<string>();
  const transforms = new Set<string>();
  const localSignals = new Set<string>();
  const externalDomains = new Set<string>();
  const shippieConnectedSignals = new Set<string>();

  for (const rule of CLOUD_PROVIDERS) {
    if (rule.pattern.test(combined)) {
      backendProviders.add(rule.provider);
      reasons.push(`imports ${rule.provider}`);
      if (rule.transform) transforms.add(rule.transform);
      if (rule.blocker) blockers.add(rule.blocker);
    }
  }

  if (backendProviders.has('supabase')) {
    for (const { pattern, blocker } of SUPABASE_BLOCKERS) {
      if (pattern.test(combined)) blockers.add(blocker);
    }
  }

  for (const { pattern, provider } of SERVER_RULES) {
    if (pattern.test(combined)) {
      backendProviders.add(provider);
      reasons.push(`server route detected: ${provider}`);
    }
  }

  for (const { pattern, signal } of LOCAL_SIGNALS) {
    if (pattern.test(combined)) {
      localSignals.add(signal);
    }
  }

  for (const { pattern, signal } of SHIPPIE_CONNECTED_RULES) {
    if (pattern.test(combined)) {
      shippieConnectedSignals.add(signal);
    }
  }

  const urlPattern = new RegExp(URL_LITERAL.source, URL_LITERAL.flags);
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(combined)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    let host: string;
    try {
      host = new URL(raw).host;
    } catch {
      continue;
    }
    if (!host) continue;
    if (isShippieHost(host)) continue;
    externalDomains.add(host);
  }

  let detectedKind: AppKind;
  if (backendProviders.size > 0) {
    detectedKind = 'cloud';
  } else if (externalDomains.size > 0 || shippieConnectedSignals.size > 0) {
    detectedKind = 'connected';
    for (const domain of externalDomains) {
      reasons.push(`fetches ${domain}`);
    }
    if (shippieConnectedSignals.size > 0) {
      reasons.push(
        `multi-peer via Shippie: ${[...shippieConnectedSignals].sort().join(', ')}`,
      );
    }
  } else {
    detectedKind = 'local';
    if (localSignals.size > 0) {
      reasons.push(`local storage: ${[...localSignals].sort().join(', ')}`);
    } else {
      reasons.push('no external dependencies detected');
    }
  }

  // Confidence: how much of the bundle was actually scannable JS/TS.
  // Empty bundle → 0; all-scanned → 0.95 (we never claim 1.0 for
  // regex-only analysis).
  const coverage = totalBytes === 0 ? 0 : scannedBytes / totalBytes;
  const confidence = totalBytes === 0 ? 0 : Math.min(0.95, Math.max(0.4, coverage));

  return {
    detectedKind,
    confidence,
    reasons,
    externalDomains: [...externalDomains].sort(),
    backendProviders: [...backendProviders].sort(),
    localSignals: [...localSignals].sort(),
    localization: {
      candidate:
        detectedKind === 'cloud' && transforms.size > 0 && blockers.size === 0,
      blockers: [...blockers].sort(),
      supportedTransforms: [...transforms].sort(),
    },
  };
}
