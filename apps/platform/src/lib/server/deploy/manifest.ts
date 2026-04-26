/**
 * Manifest derivation for static deploys.
 *
 * Ported from apps/web/lib/deploy/index.ts:deriveManifest. Same semantics:
 *   - Maker-provided shippie.json wins.
 *   - Otherwise, look for shippie.json in the zip.
 *   - Otherwise auto-draft from defaults + BaaS scanner output.
 *
 * The BaaS scanner is inlined here as a Worker-friendly module — no
 * dependency on apps/web/lib/trust.
 */

export interface ShippieJsonLite {
  version?: number;
  slug: string;
  type: 'app' | 'web_app' | 'website';
  name: string;
  tagline?: string;
  description?: string;
  category: string;
  theme_color?: string;
  background_color?: string;
  icon?: string;
  permissions?: {
    auth?: boolean;
    storage?: 'none' | 'r' | 'rw';
    files?: boolean;
    notifications?: boolean;
    analytics?: boolean;
    external_network?: boolean;
  };
  allowed_connect_domains?: string[];
}

export interface DeriveManifestInput {
  slug: string;
  shippieJson?: ShippieJsonLite;
  files: Map<string, Uint8Array>;
}

export interface DerivedManifest {
  manifest: ShippieJsonLite;
  notes: string[];
  error?: string;
}

export function deriveManifest(input: DeriveManifestInput): DerivedManifest {
  // Maker-provided manifest always wins
  if (input.shippieJson) {
    return { manifest: { ...input.shippieJson, slug: input.slug }, notes: [] };
  }

  const provided = readShippieJson(input.files);
  if (provided.ok) {
    try {
      // Light normalization — keep maker's fields, fill in essentials.
      const m = provided.value as Record<string, unknown>;
      const manifest: ShippieJsonLite = {
        version: typeof m.version === 'number' ? m.version : 1,
        slug: input.slug,
        type: (m.type as ShippieJsonLite['type']) ?? 'app',
        name: typeof m.name === 'string' ? m.name : titleCase(input.slug),
        tagline: typeof m.tagline === 'string' ? m.tagline : undefined,
        description: typeof m.description === 'string' ? m.description : undefined,
        category: typeof m.category === 'string' ? m.category : 'tools',
        theme_color: typeof m.theme_color === 'string' ? m.theme_color : '#E8603C',
        background_color: typeof m.background_color === 'string' ? m.background_color : '#ffffff',
        icon: typeof m.icon === 'string' ? m.icon : undefined,
        permissions: typeof m.permissions === 'object' && m.permissions !== null
          ? (m.permissions as ShippieJsonLite['permissions'])
          : undefined,
        allowed_connect_domains: Array.isArray(m.allowed_connect_domains)
          ? (m.allowed_connect_domains.filter((x) => typeof x === 'string') as string[])
          : undefined,
      };
      return {
        manifest,
        notes: ['Loaded maker shippie.json.'],
      };
    } catch (err) {
      return {
        manifest: defaultManifest(input.slug),
        notes: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  if (provided.error) {
    return {
      manifest: defaultManifest(input.slug),
      notes: [],
      error: provided.error,
    };
  }

  // Auto-draft path — scan for BaaS hostnames and pre-populate
  // allowed_connect_domains.
  const base = defaultManifest(input.slug);
  const baas = scanForBaas(input.files);
  const notes: string[] = [];

  if (baas.found) {
    base.permissions = { ...(base.permissions ?? {}), external_network: true };
    base.allowed_connect_domains = baas.domains;
    notes.push(
      `Auto-detected ${baas.providers.join(' + ')} — external network allowed for: ${baas.domains.join(', ')}`,
    );
  }

  return { manifest: base, notes };
}

function defaultManifest(slug: string): ShippieJsonLite {
  return {
    version: 1,
    slug,
    type: 'app',
    name: titleCase(slug),
    category: 'tools',
    theme_color: '#E8603C',
    background_color: '#ffffff',
  };
}

function readShippieJson(
  files: Map<string, Uint8Array>,
): { ok: true; value: unknown } | { ok: false; error?: string } {
  const buf = files.get('shippie.json');
  if (!buf) return { ok: false };
  try {
    const text = new TextDecoder().decode(buf);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

// ----------------------------------------------------------------------
// BaaS scanner (ported inline from apps/web/lib/trust/baas-scanner.ts)
// ----------------------------------------------------------------------

const PER_FILE_BYTE_CAP = 5 * 1024 * 1024;

interface BaasProvider {
  name: string;
  patterns: readonly string[];
}

const BAAS_PROVIDERS: readonly BaasProvider[] = [
  { name: 'Supabase', patterns: ['*.supabase.co', '*.supabase.in'] },
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
  { name: 'Clerk', patterns: ['*.clerk.accounts.dev', '*.clerk.com', 'clerk.dev', '*.clerk.dev'] },
  { name: 'Auth0', patterns: ['*.auth0.com'] },
  { name: 'Vercel Storage', patterns: ['*.vercel-storage.com', '*.public.blob.vercel-storage.com'] },
  { name: 'Upstash', patterns: ['*.upstash.io'] },
  { name: 'PlanetScale', patterns: ['*.planetscale.com', '*.psdb.cloud'] },
  { name: 'Neon', patterns: ['*.neon.tech'] },
];

interface BaasScanResult {
  found: boolean;
  domains: string[];
  providers: string[];
}

const URL_PATTERN = /https?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])(?::\d+)?(?:\/[^\s"'<>`)}\],]*)?/gi;

export function scanForBaas(files: Map<string, Uint8Array>): BaasScanResult {
  const domains = new Set<string>();
  const providers = new Set<string>();
  const decoder = new TextDecoder();

  for (const [path, buf] of files) {
    if (!isScannable(path)) continue;

    const slice = buf.byteLength > PER_FILE_BYTE_CAP ? buf.subarray(0, PER_FILE_BYTE_CAP) : buf;
    const text = decoder.decode(slice);

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

function matchProvider(host: string): BaasProvider | null {
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
    const suffix = p.slice(1);
    return h.length > suffix.length && h.endsWith(suffix);
  }
  return h === p;
}

function isScannable(path: string): boolean {
  const lower = path.toLowerCase();
  if (/\.html?$/.test(lower)) return true;
  if (/\.(js|mjs|cjs|ts|tsx|jsx|svelte|vue)$/.test(lower)) return true;
  if (/\.json$/.test(lower)) return true;
  return false;
}
