import { buildShippiePackage, type BuiltShippiePackage } from '@shippie/app-package-builder';
import {
  assertValidPermissions,
  type AppPermissions,
  type AppReceipt,
  type AppVersionRecord,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';
import { manifestToContainerApp } from './app-registry';
import { createPackageFileCache, localPermissions, type ContainerApp, type LocalRow, type PackageFileCache } from './state';
import { removeAppIntentGrants, type IntentGrants } from './intent-registry';
import { removeAppTransferGrants, type TransferGrants } from './transfer-registry';

export interface InstalledPackage {
  app: ContainerApp;
  packageFiles: Record<string, PackageFileCache>;
}

export interface ContainerInstallState {
  importedApps: ContainerApp[];
  openAppIds: string[];
  receiptsByApp: Record<string, AppReceipt>;
  rowsByApp: Record<string, LocalRow[]>;
  packageFilesByApp: Record<string, Record<string, PackageFileCache>>;
  intentGrants: IntentGrants;
  transferGrants: TransferGrants;
  activeAppId: string | null;
}

export function installBuiltPackage(built: BuiltShippiePackage): InstalledPackage {
  const manifest = built.manifest;
  if (!manifest.runtime.container) {
    throw new Error('This package is standalone-only and cannot run in the container yet.');
  }
  const permissions = readPackagePermissions(built.files);
  const version = readPackageVersionRecord(built.files);
  return {
    app: manifestToContainerApp(manifest, permissions, version?.data),
    packageFiles: packageFilesFromBuiltPackage(built),
  };
}

export function packageFilesFromBuiltPackage(
  built: Pick<BuiltShippiePackage, 'files'>,
): Record<string, PackageFileCache> {
  return Object.fromEntries(
    [...built.files.entries()].map(([path, bytes]) => [path, createPackageFileCache(path, bytes)]),
  );
}

export function readPackagePermissions(files: ReadonlyMap<string, Uint8Array>): AppPermissions {
  const bytes = files.get('permissions.json');
  if (!bytes) throw new Error('.shippie archive is missing permissions.json.');
  const permissions = JSON.parse(new TextDecoder().decode(bytes)) as AppPermissions;
  assertValidPermissions(permissions);
  return permissions;
}

function readPackageVersionRecord(files: ReadonlyMap<string, Uint8Array>): AppVersionRecord | null {
  const bytes = files.get('version.json');
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AppVersionRecord>;
    return typeof parsed.code?.version === 'string' ? (parsed as AppVersionRecord) : null;
  } catch {
    return null;
  }
}

export async function buildSingleHtmlPackage(file: File): Promise<BuiltShippiePackage> {
  const slug = slugFromFilename(file.name);
  const name = titleCase(slug);
  const now = new Date().toISOString();
  const permissions = localPermissions(slug);
  const version: AppVersionRecord = {
    code: {
      version: '1.0.0',
      channel: 'experimental',
      packageHash: `sha256:${'0'.repeat(64)}`,
    },
    trust: {
      permissionsVersion: 1,
      externalDomains: [],
    },
    data: {
      schemaVersion: 1,
    },
  };
  const source: SourceMetadata = {
    license: 'private',
    sourceAvailable: false,
    remix: {
      allowed: false,
      commercialUse: false,
      attributionRequired: false,
    },
    lineage: {
      template: 'single-html-import',
    },
  };
  const trustReport: TrustReport = {
    kind: {
      detected: 'local',
      status: 'verifying',
      reasons: ['Imported as a single HTML file on this device.'],
    },
    security: {
      stage: 'maker-facing',
      score: null,
      findings: [],
    },
    privacy: {
      grade: null,
      externalDomains: [],
    },
    containerEligibility: 'compatible',
  };

  return buildShippiePackage({
    app: {
      id: `app_local_${slug.replace(/-/g, '_')}`,
      slug,
      name,
      description: 'Imported from a single HTML file on this device.',
      kind: 'local',
      entry: 'app/index.html',
      createdAt: now,
      maker: { id: 'local-device', name: 'This device' },
      domains: { canonical: `/run/${slug}` },
      runtime: { standalone: true, container: true, hub: false, minimumSdk: '1.0.0' },
    },
    appFiles: {
      'index.html': await file.text(),
    },
    version,
    permissions,
    source,
    trustReport,
  });
}

export function recoveredReceiptsFor(
  receiptsByApp: Record<string, AppReceipt>,
  appById: ReadonlyMap<string, ContainerApp>,
): Array<{ appId: string; receipt: AppReceipt }> {
  return Object.entries(receiptsByApp)
    .filter(([appId]) => !appById.has(appId))
    .map(([appId, receipt]) => ({ appId, receipt }));
}

export function uninstallContainerAppState(
  state: ContainerInstallState,
  appId: string,
): ContainerInstallState {
  const { [appId]: _receipt, ...nextReceipts } = state.receiptsByApp;
  const { [appId]: _rows, ...nextRows } = state.rowsByApp;
  const { [appId]: _files, ...nextFiles } = state.packageFilesByApp;

  return {
    importedApps: state.importedApps.filter((app) => app.id !== appId),
    openAppIds: state.openAppIds.filter((id) => id !== appId),
    receiptsByApp: nextReceipts,
    rowsByApp: nextRows,
    packageFilesByApp: nextFiles,
    intentGrants: removeAppIntentGrants(state.intentGrants, appId),
    transferGrants: removeAppTransferGrants(state.transferGrants, appId),
    activeAppId: state.activeAppId === appId ? null : state.activeAppId,
  };
}

function slugFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  return withoutExtension.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'tool';
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
