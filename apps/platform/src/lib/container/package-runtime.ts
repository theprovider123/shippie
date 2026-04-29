import type { BuiltShippiePackage } from '@shippie/app-package-builder';
import {
  assertValidPermissions,
  type AppPermissions,
  type AppReceipt,
} from '@shippie/app-package-contract';
import { manifestToContainerApp } from './app-registry';
import { createPackageFileCache, type ContainerApp, type LocalRow, type PackageFileCache } from './state';
import { removeAppIntentGrants, type IntentGrants } from './intent-registry';

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
  activeAppId: string | null;
}

export function installBuiltPackage(built: BuiltShippiePackage): InstalledPackage {
  const manifest = built.manifest;
  if (!manifest.runtime.container) {
    throw new Error('This package is standalone-only and cannot run in the container yet.');
  }
  const permissions = readPackagePermissions(built.files);
  return {
    app: manifestToContainerApp(manifest, permissions),
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
    activeAppId: state.activeAppId === appId ? null : state.activeAppId,
  };
}
