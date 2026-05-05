/**
 * Container shell — app registry.
 *
 * Pure helpers for combining curated apps, DB-loaded packages, and
 * imported package archives into the unified app list the container UI
 * renders. No reactive state — call sites pass arrays in, get arrays out.
 */

import type { AppPackageManifest, AppPermissions, TrustReport } from '@shippie/app-package-contract';
import { containerSlugForRequest } from '$lib/showcase-slugs';
import {
  accentForKind,
  curatedApps,
  initials,
  labelForKind,
  localPermissions,
  type ContainerApp,
} from './state';

interface PackageSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null | undefined;
  appKind: ContainerApp['appKind'];
  entry: string;
  version: string;
  packageHash: string;
  standaloneUrl: string;
  permissions: ContainerApp['permissions'];
  trust?: Pick<TrustReport, 'containerEligibility' | 'privacy' | 'security'>;
}

/**
 * Convert a DB-loaded package summary (PageData['packages'][n]) into a
 * ContainerApp the UI can render. The DB shape and the ContainerApp
 * shape diverge over time; this is the one conversion site.
 */
export function packageToContainerApp(pkg: PackageSummary): ContainerApp {
  return {
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    shortName: pkg.name.split(/\s+/).slice(0, 2).join(' '),
    description: pkg.description ?? 'A package loaded from the Shippie package registry.',
    appKind: pkg.appKind,
    entry: pkg.entry,
    labelKind: labelForKind(pkg.appKind),
    icon: initials(pkg.name),
    accent: accentForKind(pkg.appKind),
    version: pkg.version,
    packageHash: pkg.packageHash,
    standaloneUrl: pkg.standaloneUrl,
    permissions: pkg.permissions,
    trust: pkg.trust,
  };
}

/**
 * Convert an imported package manifest (from the Create tab paste flow)
 * into a ContainerApp. Falls back to manifest-aware defaults for fields
 * the manifest doesn't carry.
 */
export function manifestToContainerApp(
  manifest: AppPackageManifest,
  permissions?: AppPermissions,
): ContainerApp {
  return {
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    shortName: manifest.name.split(/\s+/).slice(0, 2).join(' '),
    description: manifest.description ?? 'Imported from a portable Shippie package manifest.',
    appKind: manifest.kind,
    entry: manifest.entry,
    labelKind: labelForKind(manifest.kind),
    icon: initials(manifest.name),
    accent: accentForKind(manifest.kind),
    version: 'imported',
    packageHash: manifest.packageHash,
    standaloneUrl: manifest.domains.canonical,
    permissions: permissions ?? localPermissions(manifest.slug),
  };
}

/**
 * Merge base apps (curated + DB-loaded) with imported apps, dedupe by
 * id (imported wins so re-importing replaces). Returns the combined
 * list plus a Map for fast lookups and the default app id.
 */
export function mergeApps(
  baseApps: ContainerApp[],
  importedApps: ContainerApp[],
): { apps: ContainerApp[]; appById: Map<string, ContainerApp>; defaultAppId: string | null } {
  const importedIds = new Set(importedApps.map((app) => app.id));
  const merged = [...baseApps.filter((app) => !importedIds.has(app.id)), ...importedApps];
  return {
    apps: merged,
    appById: new Map(merged.map((app) => [app.id, app])),
    defaultAppId: baseApps[0]?.id ?? null,
  };
}

/**
 * Resolve the maker-requested app slug (from `?app=slug` query) to a
 * ContainerApp. Returns null when the slug isn't installed.
 */
export function findRequestedApp(
  apps: ContainerApp[],
  requestedSlug: string | null | undefined,
): ContainerApp | null {
  if (!requestedSlug) return null;
  const normalized = containerSlugForRequest(requestedSlug);
  return apps.find((app) => app.slug === normalized || app.slug === requestedSlug) ?? null;
}

/**
 * Pick the base app list. When a deploy registry has packages, those win;
 * otherwise fall back to curated showcases shipped with the container.
 */
export function pickBaseApps(packages: PackageSummary[]): ContainerApp[] {
  if (packages.length === 0) return curatedApps;
  return packages.map(packageToContainerApp);
}
