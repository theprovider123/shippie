export const SHIPPIE_PACKAGE_SCHEMA = 'shippie.package.v1' as const;
export const SHIPPIE_PERMISSIONS_SCHEMA = 'shippie.permissions.v1' as const;
export const SHIPPIE_RECEIPT_SCHEMA = 'shippie.receipt.v1' as const;
export const SHIPPIE_BACKUP_SCHEMA = 'shippie.user-backup.v1' as const;
export const SHIPPIE_BRIDGE_PROTOCOL = 'shippie.bridge.v1' as const;
export const SHIPPIE_COLLECTION_SCHEMA = 'shippie.collection.v1' as const;

export type AppKind = 'local' | 'connected' | 'cloud';

export type ReleaseChannel = 'stable' | 'beta' | 'experimental' | 'venue' | 'classroom';

export type ContainerEligibility =
  | 'first_party'
  | 'curated'
  | 'compatible'
  | 'standalone_only'
  | 'blocked';

export type InstallSource = 'marketplace' | 'url' | 'hub' | 'package' | 'nearby';

export type AppCollectionKind = 'official' | 'maker' | 'community' | 'hub' | 'local';

export type BridgeCapability =
  | 'app.info'
  | 'storage.getUsage'
  | 'db.query'
  | 'db.insert'
  | 'files.write'
  | 'files.url'
  | 'ai.run'
  | 'feedback.open'
  | 'analytics.track'
  | 'network.fetch'
  | 'intent.provide'
  | 'intent.consume'
  // Phase A5 — universal "open Your Data" capability. Available to every
  // iframe app without any extra permission grant: the panel only ever
  // shows the user their OWN data, scoped to the calling app's namespace,
  // so it carries no escalation surface. Iframe apps call this to surface
  // backup / transfer / delete-app-data flows without re-implementing them.
  | 'data.openPanel'
  // Phase B4 — universal "fire a sensory texture" capability. Iframe apps
  // pick from the 9 built-in presets (confirm/complete/error/navigate/
  // delete/refresh/install/milestone/toggle); the container owns the only
  // engine instance and serialises haptic+sound+visual within one rAF.
  // No data surface, no escalation, available to every iframe app.
  | 'feel.texture'
  // Phase P1A — universal "list overlapping apps" capability. Returns
  // only apps whose declared intents overlap with the caller's
  // declared provides/consumes. Apps that don't share any intent with
  // the caller stay invisible — minimises cross-iframe fingerprinting.
  // Universal: no permission grant required because the scoping is
  // enforced in the container handler, not the cap.
  | 'apps.list'
  // Phase P1A — universal "read agent insights derived from data this
  // app can see" capability. The handler enforces a source-data
  // invariant: only insights whose input rows belong to this app's
  // namespace OR an intent the app has been granted access to are
  // returned. Cross-app correlations the caller never had access to
  // are filtered out at the binding.
  | 'agent.insights'
  // Phase A3 — system-tier capabilities. NEVER granted to iframe apps.
  // Reserved for the container's own internal hosts: the agent runtime
  // (C1), future cross-app intelligence layer, and any sub-frame the
  // container itself owns. The contract treats every `system.*`
  // capability as gated on `permissions.capabilities.system.tasks`,
  // which iframe apps cannot have set.
  | 'system.crossDb.query'
  | 'system.notify'
  | 'system.openApp';

/**
 * System-tier task identifiers. Mirrors the BridgeCapability namespace
 * for system.* entries. Kept as its own union so the system handler
 * map can be typed independently and so iframe apps can NEVER receive
 * a system task as a regular capability grant.
 */
export type SystemTask = 'cross_db_query' | 'notify' | 'open_app';

const BRIDGE_CAPABILITY_TO_SYSTEM_TASK: Partial<Record<BridgeCapability, SystemTask>> = {
  'system.crossDb.query': 'cross_db_query',
  'system.notify': 'notify',
  'system.openApp': 'open_app',
};

export function isSystemCapability(capability: BridgeCapability): boolean {
  return capability in BRIDGE_CAPABILITY_TO_SYSTEM_TASK;
}

export function systemTaskFor(capability: BridgeCapability): SystemTask | undefined {
  return BRIDGE_CAPABILITY_TO_SYSTEM_TASK[capability];
}

export interface PackageMaker {
  id: string;
  name: string;
  profileUrl?: string;
}

export interface PackageDomains {
  canonical: string;
  custom?: readonly string[];
}

export interface PackageRuntimeTargets {
  standalone: boolean;
  container: boolean;
  hub: boolean;
  minimumSdk: string;
}

export interface AppPackageManifest {
  schema: typeof SHIPPIE_PACKAGE_SCHEMA;
  id: string;
  slug: string;
  name: string;
  description?: string;
  kind: AppKind;
  entry: string;
  packageHash: string;
  createdAt: string;
  maker: PackageMaker;
  domains: PackageDomains;
  runtime: PackageRuntimeTargets;
}

export interface AppVersionRecord {
  code: {
    version: string;
    channel: ReleaseChannel;
    sourceCommit?: string;
    packageHash: string;
  };
  trust: {
    permissionsVersion: number;
    trustReportHash?: string;
    externalDomains: readonly string[];
  };
  data: {
    schemaVersion: number;
    migrationPlanHash?: string;
  };
}

export interface LocalDbPermission {
  enabled: boolean;
  namespace: string;
}

export interface LocalFilesPermission {
  enabled: boolean;
  namespace: string;
}

export interface LocalAiPermission {
  tasks: readonly string[];
}

export interface NetworkPermissions {
  allowedDomains: readonly string[];
  declaredPurpose: Record<string, string>;
}

export interface CrossAppIntentPermissions {
  provides: readonly string[];
  consumes: readonly string[];
}

/**
 * Phase A3 — system-tier grant. NEVER set on iframe-app permissions.
 * Reserved for hosts the container itself instantiates: the agent
 * runtime, cross-app intelligence layer, future maintenance workers.
 *
 * The contract treats `permissions.capabilities.system.tasks` as the
 * authority list for system.* capabilities. An iframe app whose
 * manifest accidentally declares this still cannot exercise it because
 * the deploy pipeline must never copy `system` into a published
 * `AppPermissions` (validators below + manifest builders enforce).
 */
export interface SystemPermission {
  tasks: readonly SystemTask[];
}

export interface AppPermissions {
  schema: typeof SHIPPIE_PERMISSIONS_SCHEMA;
  capabilities: {
    localDb?: LocalDbPermission;
    localFiles?: LocalFilesPermission;
    localAi?: LocalAiPermission;
    network?: NetworkPermissions;
    crossAppIntents?: CrossAppIntentPermissions;
    feedback?: { enabled: boolean };
    analytics?: { enabled: boolean; mode: 'aggregate-only' };
    system?: SystemPermission;
  };
}

export interface SourceLineage {
  template?: string;
  parentAppId?: string | null;
  forkedFromVersion?: string | null;
}

export interface SourceMetadata {
  repo?: string;
  license: string;
  sourceAvailable: boolean;
  remix: {
    allowed: boolean;
    commercialUse: boolean;
    attributionRequired: boolean;
  };
  lineage: SourceLineage;
}

export interface TrustReport {
  kind: {
    detected: AppKind;
    status: 'estimated' | 'verifying' | 'confirmed' | 'disputed' | 'revoked';
    reasons: string[];
  };
  security: {
    stage: 'maker-facing' | 'public';
    score: number | null;
    findings: string[];
  };
  privacy: {
    grade: 'A+' | 'A' | 'B' | 'C' | 'F' | null;
    externalDomains: Array<{
      domain: string;
      purpose: string;
      personalData: boolean;
    }>;
  };
  containerEligibility: ContainerEligibility;
}

export interface AppReceipt {
  schema: typeof SHIPPIE_RECEIPT_SCHEMA;
  appId: string;
  name: string;
  version: string;
  packageHash: string;
  installedAt: string;
  source: InstallSource;
  domains: string[];
  kind: AppKind;
  permissions: Record<string, unknown>;
}

export interface AppCollectionEntry {
  appId: string;
  slug: string;
  name: string;
  version: string;
  kind: AppKind;
  packageHash: string;
  packageUrl: string;
  manifestUrl?: string;
  domains?: readonly string[];
  iconUrl?: string;
  summary?: string;
}

export interface AppCollectionManifest {
  schema: typeof SHIPPIE_COLLECTION_SCHEMA;
  id: string;
  slug: string;
  name: string;
  description?: string;
  kind: AppCollectionKind;
  createdAt: string;
  updatedAt: string;
  publisher: PackageMaker;
  sourceUrl?: string;
  hub?: {
    origin: string;
    offline: boolean;
  };
  packages: AppCollectionEntry[];
}

export interface UserDataArchiveManifest {
  schema: typeof SHIPPIE_BACKUP_SCHEMA;
  createdAt: string;
  encrypted: boolean;
  receipts: AppReceipt[];
  apps: Array<{
    appId: string;
    packageHash: string;
    dataPath: string;
    filesPath?: string;
    settingsPath?: string;
  }>;
}

export interface BridgeRequest {
  protocol: typeof SHIPPIE_BRIDGE_PROTOCOL;
  id: string;
  appId: string;
  capability: BridgeCapability;
  method: string;
  payload: unknown;
}

export interface BridgeResponse {
  protocol: typeof SHIPPIE_BRIDGE_PROTOCOL;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export class AppPackageContractError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppPackageContractError';
  }
}

export function isSha256Hash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/i.test(value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      url.hostname === 'hub.local' ||
      url.hostname.endsWith('.local') ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

export function assertValidPackageManifest(manifest: AppPackageManifest): void {
  if (manifest.schema !== SHIPPIE_PACKAGE_SCHEMA) {
    throw new AppPackageContractError('Unsupported package manifest schema.', 'invalid_schema', {
      schema: manifest.schema,
    });
  }

  if (!manifest.id || !manifest.slug || !manifest.name) {
    throw new AppPackageContractError('Package manifest is missing identity fields.', 'missing_identity');
  }

  if (!manifest.entry.startsWith('app/')) {
    throw new AppPackageContractError('Package entry must live under app/.', 'invalid_entry', {
      entry: manifest.entry,
    });
  }

  if (!isSha256Hash(manifest.packageHash)) {
    throw new AppPackageContractError('Package hash must be a sha256 hash.', 'invalid_package_hash');
  }

  if (!isHttpUrl(manifest.domains.canonical)) {
    throw new AppPackageContractError('Canonical domain must be an HTTPS or local URL.', 'invalid_canonical_domain', {
      canonical: manifest.domains.canonical,
    });
  }
}

export function assertValidPermissions(permissions: AppPermissions): void {
  if (permissions.schema !== SHIPPIE_PERMISSIONS_SCHEMA) {
    throw new AppPackageContractError('Unsupported permissions schema.', 'invalid_schema', {
      schema: permissions.schema,
    });
  }

  // Phase A3 — defense in depth. A published app manifest must NEVER
  // declare system permissions; only container-internal hosts get them
  // (built via `systemPermissions(tasks)`). The deploy pipeline calls
  // this function on every parsed shippie.json, so a maker who tries
  // to escalate gets a clean rejection at deploy time.
  if (permissions.capabilities.system) {
    throw new AppPackageContractError(
      'Apps cannot declare system-tier permissions.',
      'system_permission_forbidden',
      {},
    );
  }

  const network = permissions.capabilities.network;
  if (!network) return;

  for (const domain of network.allowedDomains) {
    if (domain.includes('/') || domain.includes(':')) {
      throw new AppPackageContractError('Allowed network domains must be hostnames, not URLs.', 'invalid_network_domain', {
        domain,
      });
    }

    if (!network.declaredPurpose[domain]) {
      throw new AppPackageContractError('Every allowed network domain needs a declared purpose.', 'missing_network_purpose', {
        domain,
      });
    }
  }
}

export function assertValidReceipt(receipt: AppReceipt): void {
  if (receipt.schema !== SHIPPIE_RECEIPT_SCHEMA) {
    throw new AppPackageContractError('Unsupported receipt schema.', 'invalid_schema', {
      schema: receipt.schema,
    });
  }

  if (!isSha256Hash(receipt.packageHash)) {
    throw new AppPackageContractError('Receipt package hash must be a sha256 hash.', 'invalid_package_hash');
  }

  if (receipt.domains.some((domain) => !isHttpUrl(domain))) {
    throw new AppPackageContractError('Receipt domains must be HTTPS or local URLs.', 'invalid_receipt_domain');
  }
}

export function assertValidCollectionManifest(collection: AppCollectionManifest): void {
  if (collection.schema !== SHIPPIE_COLLECTION_SCHEMA) {
    throw new AppPackageContractError('Unsupported collection manifest schema.', 'invalid_schema', {
      schema: collection.schema,
    });
  }

  if (!collection.id || !collection.slug || !collection.name) {
    throw new AppPackageContractError('Collection manifest is missing identity fields.', 'missing_identity');
  }

  if (collection.sourceUrl && !isHttpUrl(collection.sourceUrl)) {
    throw new AppPackageContractError('Collection source URL must be HTTPS or local.', 'invalid_collection_source', {
      sourceUrl: collection.sourceUrl,
    });
  }

  if (collection.hub?.origin && !isHttpUrl(collection.hub.origin)) {
    throw new AppPackageContractError('Hub origin must be HTTPS or local.', 'invalid_hub_origin', {
      origin: collection.hub.origin,
    });
  }

  const seenHashes = new Set<string>();
  for (const entry of collection.packages) {
    if (!entry.appId || !entry.slug || !entry.name || !entry.version) {
      throw new AppPackageContractError('Collection entry is missing identity fields.', 'missing_collection_entry');
    }

    if (!isSha256Hash(entry.packageHash)) {
      throw new AppPackageContractError('Collection package hash must be a sha256 hash.', 'invalid_package_hash', {
        slug: entry.slug,
        packageHash: entry.packageHash,
      });
    }

    if (seenHashes.has(entry.packageHash)) {
      throw new AppPackageContractError('Collection contains a duplicate package hash.', 'duplicate_package_hash', {
        packageHash: entry.packageHash,
      });
    }
    seenHashes.add(entry.packageHash);

    if (!isHttpUrl(entry.packageUrl)) {
      throw new AppPackageContractError('Collection package URL must be HTTPS or local.', 'invalid_package_url', {
        slug: entry.slug,
        packageUrl: entry.packageUrl,
      });
    }

    if (entry.manifestUrl && !isHttpUrl(entry.manifestUrl)) {
      throw new AppPackageContractError('Collection manifest URL must be HTTPS or local.', 'invalid_manifest_url', {
        slug: entry.slug,
        manifestUrl: entry.manifestUrl,
      });
    }

    if (entry.iconUrl && !isHttpUrl(entry.iconUrl)) {
      throw new AppPackageContractError('Collection icon URL must be HTTPS or local.', 'invalid_icon_url', {
        slug: entry.slug,
        iconUrl: entry.iconUrl,
      });
    }

    if (entry.domains?.some((domain) => !isHttpUrl(domain))) {
      throw new AppPackageContractError('Collection entry domains must be HTTPS or local.', 'invalid_entry_domain', {
        slug: entry.slug,
      });
    }
  }
}

export function collectionEntryToReceiptInput(
  entry: AppCollectionEntry,
  source: InstallSource,
): Omit<AppReceipt, 'schema' | 'installedAt'> {
  return {
    appId: entry.appId,
    name: entry.name,
    version: entry.version,
    packageHash: entry.packageHash,
    source,
    domains: entry.domains?.length ? [...entry.domains] : [entry.packageUrl],
    kind: entry.kind,
    permissions: {},
  };
}

export function assertCapabilityAllowed(
  permissions: AppPermissions,
  capability: BridgeCapability,
  options: { domain?: string; intent?: string } = {},
): void {
  switch (capability) {
    case 'app.info':
    case 'storage.getUsage':
      return;
    case 'db.query':
    case 'db.insert':
      if (permissions.capabilities.localDb?.enabled) return;
      break;
    case 'files.write':
    case 'files.url':
      if (permissions.capabilities.localFiles?.enabled) return;
      break;
    case 'ai.run':
      if (permissions.capabilities.localAi?.tasks.length) return;
      break;
    case 'feedback.open':
      if (permissions.capabilities.feedback?.enabled) return;
      break;
    case 'analytics.track':
      if (permissions.capabilities.analytics?.enabled) return;
      break;
    case 'network.fetch':
      if (options.domain && isNetworkDomainAllowed(permissions, options.domain)) return;
      break;
    case 'intent.provide':
      if (options.intent && permissions.capabilities.crossAppIntents?.provides.includes(options.intent)) return;
      break;
    case 'intent.consume':
      if (options.intent && permissions.capabilities.crossAppIntents?.consumes.includes(options.intent)) return;
      break;
    case 'data.openPanel':
      // Universal — every app can ask the container to show its data
      // panel. The panel scopes to the calling app's namespace, so no
      // capability grant is required.
      return;
    case 'feel.texture':
      // Universal — every app can fire a built-in sensory texture. No
      // data surface; the texture name is validated by the router. This
      // is the "small joys" layer: haptics + sound + visual fired in
      // lockstep within the container's single texture engine.
      return;
    case 'apps.list':
      // Universal — the container scopes results to apps with
      // overlapping intents. No grant required at the contract level.
      return;
    case 'agent.insights':
      // Universal — the container enforces the source-data invariant
      // (only insights derived from data this app can see). No grant
      // required at the contract level.
      return;
    case 'system.crossDb.query':
    case 'system.notify':
    case 'system.openApp': {
      const task = systemTaskFor(capability);
      if (task && permissions.capabilities.system?.tasks.includes(task)) return;
      break;
    }
  }

  throw new AppPackageContractError('Capability is not granted for this app.', 'capability_not_allowed', {
    capability,
    ...options,
  });
}

/**
 * Build a system-tier permissions object for a container-internal host.
 * Use this when constructing the agent runtime's bridge host. Iframe
 * apps must never receive permissions built by this function — the
 * standard `localPermissions` factory does NOT call this.
 */
export function systemPermissions(tasks: readonly SystemTask[]): AppPermissions {
  return {
    schema: SHIPPIE_PERMISSIONS_SCHEMA,
    capabilities: {
      system: { tasks },
    },
  };
}

export function isNetworkDomainAllowed(permissions: AppPermissions, domain: string): boolean {
  const hostname = normalizeHostname(domain);
  return Boolean(hostname && permissions.capabilities.network?.allowedDomains.includes(hostname));
}

export function normalizeHostname(value: string): string | null {
  if (value.includes('://')) {
    try {
      return new URL(value).hostname;
    } catch {
      return null;
    }
  }

  if (value.includes('/') || value.includes(':')) return null;
  return value.toLowerCase();
}

export function createBridgeRequest(input: Omit<BridgeRequest, 'protocol'>): BridgeRequest {
  return {
    protocol: SHIPPIE_BRIDGE_PROTOCOL,
    ...input,
  };
}

export function createBridgeResponse(input: Omit<BridgeResponse, 'protocol'>): BridgeResponse {
  return {
    protocol: SHIPPIE_BRIDGE_PROTOCOL,
    ...input,
  };
}

export function createAppReceipt(
  input: Omit<AppReceipt, 'schema' | 'installedAt'> & { installedAt?: string },
): AppReceipt {
  const receipt: AppReceipt = {
    schema: SHIPPIE_RECEIPT_SCHEMA,
    installedAt: input.installedAt ?? new Date().toISOString(),
    appId: input.appId,
    name: input.name,
    version: input.version,
    packageHash: input.packageHash,
    source: input.source,
    domains: input.domains,
    kind: input.kind,
    permissions: input.permissions,
  };
  assertValidReceipt(receipt);
  return receipt;
}

export function canShowRemixAction(source: SourceMetadata): boolean {
  return source.sourceAvailable && source.remix.allowed && Boolean(source.license);
}

export function canLoadInContainer(report: Pick<TrustReport, 'containerEligibility'>): boolean {
  return (
    report.containerEligibility === 'first_party' ||
    report.containerEligibility === 'curated' ||
    report.containerEligibility === 'compatible'
  );
}
