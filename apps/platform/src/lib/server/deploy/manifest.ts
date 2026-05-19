/**
 * Manifest derivation for static deploys.
 *
 * Ported from apps/web/lib/deploy/index.ts:deriveManifest. Same semantics:
 *   - Maker-provided shippie.json wins.
 *   - Otherwise, look for shippie.json in the zip.
 *   - Otherwise auto-draft from defaults + local-data passport metadata.
 */
import { parseMakerCuration, type MakerCuration } from '$lib/curation/schema';

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
  /**
   * Optional resource hosts (images/fonts/media) that are safe to allow in
   * runtime CSP when they are not directly discoverable from the bundle.
   * Example: a product API may return image URLs from a sibling CDN host.
   */
  allowed_resource_domains?: string[];
  /**
   * Phase A2 — declared cross-app intents this app participates in.
   *
   * `provides` lists intents the app can emit data for (e.g. a recipe
   *   app providing 'shopping-list'). The container exposes the app's
   *   local rows under this intent name to consumers that the user has
   *   granted permission to.
   * `consumes` lists intents the app reads from. The container routes
   *   the call to a matching provider after a one-time user grant.
   *
   * Both arrays are simple kebab-case identifiers; the container uses
   * exact-match in v1. A future iteration introduces semantic matching
   * and provider/consumer schemas.
   */
  intents?: {
    provides?: string[];
    consumes?: string[];
  };
  /**
   * Legacy maker-declared app kind. Public listings now use a single
   * Local Tool promise plus capabilities; this remains during migration
   * so old shippie.json files continue to parse.
   */
  kind?: 'local' | 'connected' | 'cloud';
  /**
   * Maker-declared core-workflow probes. v1: list of route paths or selectors the
   * wrapper observes for offline completion. Used to upgrade
   * publicKindStatus from `verifying` to `confirmed`.
   */
  workflow_probes?: string[];
  /**
   * Phase 5 update-safety: declared destructive schema migrations.
   *
   * Additive migrations (ADD COLUMN) run automatically; the wrapper
   * REFUSES to run anything destructive unless declared here.
   *
   * `rename`     map of oldColumn → newColumn for table-level renames.
   * `drop`       column names safe to remove. Wrapper still keeps a
   *              30-day shadow under `_shippie_shadow_drops` so the user
   *              can roll back via the Your Data panel.
   * `transform`  oldColumn → { to: newColumn, copy?: bool } pairs.
   *
   * Each rule is per-table and scoped at the consumer's discretion;
   * the wrapper applies migrations against the user's local SQLite db
   * for tables the maker's code actually opens.
   */
  migrations?: {
    rename?: Record<string, string>;
    drop?: string[];
    transform?: Record<string, { to: string; copy?: boolean }>;
  };
  /**
   * Shippie app-data inheritance contract.
   *
   * Every app gets the platform Your Data / sealed-copy experience by
   * default. Makers may explicitly opt out for stateless apps, but
   * durable app data should flow through Shippie Documents so users can
   * add devices, move phones, recover from Safari storage wipes, and
   * keep sealed copies that Shippie can store but cannot open.
  */
  data?: ShippieDataPolicy;
  /**
   * Data Passport v0. Names the app's durable data family so a remix or
   * successor can declare compatibility before runtime migration runners
   * exist. v0 is metadata only.
   */
  data_passport?: ShippieDataPassport;
  spaces?: ShippieSpacesPolicy;
  /**
   * Container commons ownership metadata. These are optional so existing
   * vibe-coded apps still deploy, but when present they travel into the
   * package/source metadata and marketplace ownership surfaces.
   */
  source_repo?: string;
  license?: string;
  remix_allowed?: boolean;
  template_id?: string;
  parent_app_id?: string;
  parent_version?: string;
  /**
   * Maker-uploadable curation block. Validated by
   * `MakerCuration` (see `lib/curation/schema.ts`); the `successor`
   * field is intentionally NOT exposed to maker uploads (curator-side
   * concern only) and is stripped defence-in-depth at parse time.
   *
   * If absent, the surface resolver in `pipeline.ts:deployStatic`
   * falls back to: form override → existing D1 row's surface →
   * 'featured'.
   */
  curation?: MakerCuration;
}

export type ShippieDataMode = 'shippie-documents' | 'local-only' | 'none';
export type ShippieDataRecovery = 'inherited' | 'none';
export type ShippieDataMigration = 'snapshot-v0' | 'custom' | 'none';
export type ShippieDataSnapshots = 'inherited' | 'none';
export type ShippieDataMedia = 'encrypted-chunked' | 'none';
export type ShippieDataRealtime = 'inherited' | 'none';

export interface ShippieDataStorageScope {
  keys: string[];
  prefixes: string[];
}

export interface ShippieDataPolicy {
  mode: ShippieDataMode;
  documents: string[];
  attachments: boolean;
  recovery: ShippieDataRecovery;
  migrations: ShippieDataMigration;
  snapshots: ShippieDataSnapshots;
  media: ShippieDataMedia;
  realtime: ShippieDataRealtime;
  localStorage: ShippieDataStorageScope;
}

export interface ShippieDataPassport {
  family: string;
  schema: string;
}

export interface ShippieSpaceRole {
  id: string;
  permissions: string[];
}

export interface ShippieSpacesPolicy {
  enabled: boolean;
  roles: ShippieSpaceRole[];
  syncMode: 'gossip' | 'sealed-cloud' | 'hub' | 'inherited';
  archivable: boolean;
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
    return {
      manifest: {
        ...input.shippieJson,
        slug: input.slug,
        data: hasObjectDataPolicy((input.shippieJson as unknown as Record<string, unknown>).data)
          ? parseDataPolicy((input.shippieJson as unknown as Record<string, unknown>).data)
          : undefined,
        data_passport: parseDataPassport(
          (input.shippieJson as unknown as Record<string, unknown>).data_passport,
          input.slug,
        ),
        spaces: parseSpaces((input.shippieJson as unknown as Record<string, unknown>).spaces),
      },
      notes: [],
    };
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
        allowed_resource_domains: Array.isArray(m.allowed_resource_domains)
          ? (m.allowed_resource_domains.filter((x) => typeof x === 'string') as string[])
          : undefined,
        kind:
          m.kind === 'local' || m.kind === 'connected' || m.kind === 'cloud'
            ? m.kind
            : undefined,
        workflow_probes: Array.isArray(m.workflow_probes)
          ? (m.workflow_probes.filter((x) => typeof x === 'string') as string[])
          : undefined,
        migrations: parseMigrations(m.migrations),
        data: hasObjectDataPolicy(m.data) ? parseDataPolicy(m.data) : undefined,
        data_passport: parseDataPassport(m.data_passport, input.slug),
        spaces: parseSpaces(m.spaces),
        intents: parseIntents(m.intents),
        source_repo: typeof m.source_repo === 'string' ? m.source_repo : undefined,
        license: typeof m.license === 'string' ? m.license : undefined,
        remix_allowed: typeof m.remix_allowed === 'boolean' ? m.remix_allowed : undefined,
        template_id: typeof m.template_id === 'string' ? m.template_id : undefined,
        parent_app_id: typeof m.parent_app_id === 'string' ? m.parent_app_id : undefined,
        parent_version: typeof m.parent_version === 'string' ? m.parent_version : undefined,
        curation: parseCurationFromMaker(m.curation),
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
    data: defaultDataPolicy(slug),
    data_passport: defaultDataPassport(slug),
  };
}

export function defaultDataPassport(slug: string): ShippieDataPassport {
  const family = normalizeDataPassportPart(slug) || 'local-tool';
  return {
    family,
    schema: `${family}.v1`,
  };
}

export function parseDataPassport(raw: unknown, slug: string): ShippieDataPassport {
  const fallback = defaultDataPassport(slug);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const family =
    typeof obj.family === 'string'
      ? normalizeDataPassportPart(obj.family) || fallback.family
      : fallback.family;
  const schema =
    typeof obj.schema === 'string'
      ? normalizeDataPassportSchema(obj.schema) || `${family}.v1`
      : `${family}.v1`;
  return { family, schema };
}

export function defaultDataPolicy(slug = ''): ShippieDataPolicy {
  return {
    mode: 'shippie-documents',
    documents: ['main'],
    attachments: false,
    recovery: 'inherited',
    migrations: 'snapshot-v0',
    snapshots: 'inherited',
    media: 'none',
    realtime: 'inherited',
    localStorage: { keys: [], prefixes: [] },
  };
}

const DOCUMENT_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export function parseDataPolicy(raw: unknown): ShippieDataPolicy {
  const fallback = defaultDataPolicy();
  if (typeof raw !== 'object' || raw === null) return fallback;

  const obj = raw as Record<string, unknown>;
  const mode: ShippieDataMode =
    obj.mode === 'local-only' || obj.mode === 'none' || obj.mode === 'shippie-documents'
      ? obj.mode
      : fallback.mode;

  const declaredDocuments = Array.isArray(obj.documents)
    ? unique(
        obj.documents.filter(
          (value): value is string => typeof value === 'string' && DOCUMENT_ID_RE.test(value),
        ),
      )
    : [];

  const documents =
    declaredDocuments.length > 0
      ? declaredDocuments
      : mode === 'shippie-documents'
        ? fallback.documents
        : [];

  const recovery: ShippieDataRecovery =
    obj.recovery === 'inherited' || obj.recovery === 'none'
      ? obj.recovery
      : mode === 'shippie-documents'
        ? 'inherited'
        : 'none';

  const migrations: ShippieDataMigration =
    obj.migrations === 'snapshot-v0' || obj.migrations === 'custom' || obj.migrations === 'none'
      ? obj.migrations
      : mode === 'shippie-documents'
        ? 'snapshot-v0'
        : 'none';

  const snapshots: ShippieDataSnapshots =
    obj.snapshots === 'inherited' || obj.snapshots === 'none'
      ? obj.snapshots
      : mode === 'shippie-documents'
        ? 'inherited'
        : 'none';

  const attachments = typeof obj.attachments === 'boolean' ? obj.attachments : false;
  const media: ShippieDataMedia =
    obj.media === 'encrypted-chunked' || obj.media === 'none'
      ? obj.media
      : mode === 'shippie-documents' && attachments
        ? 'encrypted-chunked'
        : 'none';

  const realtime: ShippieDataRealtime =
    obj.realtime === 'inherited' || obj.realtime === 'none'
      ? obj.realtime
      : mode === 'shippie-documents'
        ? 'inherited'
        : 'none';

  return {
    mode,
    documents,
    attachments,
    recovery,
    migrations,
    snapshots,
    media,
    realtime,
    localStorage: parseDataStorageScope(obj.localStorage),
  };
}

const SPACE_ROLE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const SPACE_PERMISSION_RE = /^[a-z][a-z0-9_:.-]{0,63}$/;

export function parseSpaces(raw: unknown): ShippieJsonLite['spaces'] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled !== true) return undefined;
  const roles: ShippieSpaceRole[] = [];
  if (Array.isArray(obj.roles)) {
    for (const item of obj.roles) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const role = item as Record<string, unknown>;
      if (typeof role.id !== 'string' || !SPACE_ROLE_ID_RE.test(role.id)) continue;
      roles.push({
        id: role.id,
        permissions: Array.isArray(role.permissions)
          ? unique(role.permissions.filter((value): value is string => typeof value === 'string' && SPACE_PERMISSION_RE.test(value)))
          : [],
      });
    }
  }
  const syncMode =
    obj.syncMode === 'gossip' ||
    obj.syncMode === 'sealed-cloud' ||
    obj.syncMode === 'hub' ||
    obj.syncMode === 'inherited'
      ? obj.syncMode
      : 'inherited';
  return {
    enabled: true,
    roles,
    syncMode,
    archivable: obj.archivable === true,
  };
}

function parseDataStorageScope(raw: unknown): ShippieDataStorageScope {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { keys: [], prefixes: [] };
  const obj = raw as Record<string, unknown>;
  return {
    keys: Array.isArray(obj.keys) ? unique(obj.keys.filter(isSafeStoragePattern)) : [],
    prefixes: Array.isArray(obj.prefixes) ? unique(obj.prefixes.filter(isSafeStoragePattern)) : [],
  };
}

function isSafeStoragePattern(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && !value.startsWith('shippie.inherited-data.v0');
}

function normalizeDataPassportPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeDataPassportSchema(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function hasObjectDataPolicy(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Parse `migrations` from a maker's shippie.json. Lenient: unknown shapes
 * are dropped silently (additive-only is the safe default). Validation
 * errors here MUST NOT block a deploy — the wrapper enforces destructive
 * blocks at runtime regardless.
 */
/**
 * Read maker-supplied `curation` block. Returns the validated subset
 * (`MakerCuration`) on success or `undefined` if absent / invalid.
 * Invalid values do NOT block the deploy here — the surface resolver
 * downstream falls through to the next priority. Arcade-purity gating
 * is enforced separately in `deployStatic` after the surface is
 * resolved (so we know whether to enforce arcade rules).
 */
export function parseCurationFromMaker(raw: unknown): MakerCuration | undefined {
  if (raw === undefined || raw === null) return undefined;
  const result = parseMakerCuration(raw);
  return result.ok ? result.value : undefined;
}

export function parseMigrations(raw: unknown): ShippieJsonLite['migrations'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const result: NonNullable<ShippieJsonLite['migrations']> = {};

  if (obj.rename && typeof obj.rename === 'object') {
    const rename: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.rename as Record<string, unknown>)) {
      if (typeof v === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) {
        rename[k] = v;
      }
    }
    if (Object.keys(rename).length > 0) result.rename = rename;
  }

  if (Array.isArray(obj.drop)) {
    const drop = obj.drop.filter(
      (x): x is string => typeof x === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x),
    );
    if (drop.length > 0) result.drop = drop;
  }

  if (obj.transform && typeof obj.transform === 'object') {
    const transform: Record<string, { to: string; copy?: boolean }> = {};
    for (const [k, v] of Object.entries(obj.transform as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue;
      const spec = v as Record<string, unknown>;
      if (typeof spec.to !== 'string') continue;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(spec.to)) continue;
      transform[k] = {
        to: spec.to,
        copy: typeof spec.copy === 'boolean' ? spec.copy : undefined,
      };
    }
    if (Object.keys(transform).length > 0) result.transform = transform;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

const INTENT_ID_RE = /^[a-z][a-z0-9-]{0,40}$/;

/**
 * Parse `intents` from a maker's shippie.json. Lenient: invalid entries
 * are dropped silently (matching parseMigrations). The container
 * cross-references this against installed apps' permissions, so a
 * malformed intent can't escalate to capability.
 */
export function parseIntents(raw: unknown): ShippieJsonLite['intents'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const result: NonNullable<ShippieJsonLite['intents']> = {};

  if (Array.isArray(obj.provides)) {
    const provides = obj.provides.filter(
      (x): x is string => typeof x === 'string' && INTENT_ID_RE.test(x),
    );
    if (provides.length > 0) result.provides = provides;
  }

  if (Array.isArray(obj.consumes)) {
    const consumes = obj.consumes.filter(
      (x): x is string => typeof x === 'string' && INTENT_ID_RE.test(x),
    );
    if (consumes.length > 0) result.consumes = consumes;
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
// Legacy backend-domain scanner. The local-tool policy scanner is the
// deploy gate; this helper remains for migration notes and older reports.
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
  { name: 'Upstash', patterns: ['*.upstash.io'] },
  { name: 'PlanetScale', patterns: ['*.planetscale.com', '*.psdb.cloud'] },
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
