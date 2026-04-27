export const SHIPPIE_PACKAGE_SCHEMA = 'shippie.package.v1' as const;
export const SHIPPIE_PERMISSIONS_SCHEMA = 'shippie.permissions.v1' as const;
export const SHIPPIE_RECEIPT_SCHEMA = 'shippie.receipt.v1' as const;
export const SHIPPIE_BACKUP_SCHEMA = 'shippie.user-backup.v1' as const;

export type AppKind = 'local' | 'connected' | 'cloud';

export type ReleaseChannel = 'stable' | 'beta' | 'experimental' | 'venue' | 'classroom';

export type ContainerEligibility =
  | 'first_party'
  | 'curated'
  | 'compatible'
  | 'standalone_only'
  | 'blocked';

export type InstallSource = 'marketplace' | 'url' | 'hub' | 'package' | 'nearby';

export interface PackageMaker {
  id: string;
  name: string;
  profileUrl?: string;
}

export interface PackageDomains {
  canonical: string;
  custom?: string[];
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
    externalDomains: string[];
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
  tasks: string[];
}

export interface NetworkPermissions {
  allowedDomains: string[];
  declaredPurpose: Record<string, string>;
}

export interface CrossAppIntentPermissions {
  provides: string[];
  consumes: string[];
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
    return url.protocol === 'https:' || url.hostname === 'hub.local' || url.hostname.endsWith('.local');
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
