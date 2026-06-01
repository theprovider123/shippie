/**
 * Container shell — app registry.
 *
 * Pure helpers for combining curated apps, DB-loaded packages, and
 * imported package archives into the unified app list the container UI
 * renders. No reactive state — call sites pass arrays in, get arrays out.
 */

import type { AppDataPassportRecord, AppPackageManifest, AppPermissions, TrustReport } from '@shippie/app-package-contract';
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
  data?: AppDataPassportRecord;
  standaloneUrl: string;
  visibility?: ContainerApp['visibility'];
  owned?: boolean;
  permissions: ContainerApp['permissions'];
  trust?: Pick<TrustReport, 'containerEligibility' | 'privacy' | 'security'>;
  spaces?: AppPackageManifest['spaces'];
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
    data: pkg.data,
    standaloneUrl: pkg.standaloneUrl,
    visibility: pkg.visibility ?? 'public',
    owned: pkg.owned,
    permissions: pkg.permissions,
    trust: pkg.trust,
    spaces: pkg.spaces,
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
  data?: AppDataPassportRecord,
): ContainerApp {
  const app: ContainerApp = {
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
    data,
    standaloneUrl: manifest.domains.canonical,
    visibility: manifest.visibility ?? 'local',
    owned: true,
    permissions: permissions ?? localPermissions(manifest.slug),
    spaces: manifest.spaces,
  };
  // Carry surface through so the bridge's arcade-aware capability
  // gates fire for third-party arcade apps too. Manifests built before
  // slate v4 don't have `surface`; treat those as the default
  // (`featured`) by leaving the field undefined — the bridge denies
  // analytics.track only on explicit `'arcade'`.
  if (manifest.surface) app.surface = manifest.surface;
  if (manifest.tier) app.tier = manifest.tier;
  return app;
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
  return (
    apps.find((app) => app.slug === normalized) ??
    apps.find((app) => app.slug === requestedSlug) ??
    null
  );
}

/**
 * Apps shown in launcher/drawer surfaces. Archived first-party apps
 * remain resolvable for direct URLs and legacy redirects, but they
 * should not appear as choices in the current launch slate.
 */
export function visibleContainerApps(apps: readonly ContainerApp[]): ContainerApp[] {
  return apps.filter((app) => {
    if ((app.surface ?? 'featured') === 'archived') return false;
    const visibility = app.visibility ?? 'public';
    if ((visibility === 'private' || visibility === 'team') && app.owned !== true) return false;
    return true;
  });
}

/**
 * Pick the base app list. Curated showcases are always present so the
 * launcher never loses first-party tools just because the deploy registry
 * returned a partial package set. A package with the same canonical slug
 * replaces the curated runtime payload, preserving the curated ordering.
 */
export function pickBaseApps(packages: PackageSummary[]): ContainerApp[] {
  if (packages.length === 0) return curatedApps;
  const packageApps = packages.map(packageToContainerApp);
  const packagesBySlug = new Map<string, ContainerApp>();
  for (const app of packageApps) {
    const key = containerSlugForRequest(app.slug);
    if (!packagesBySlug.has(key)) packagesBySlug.set(key, app);
  }

  const seen = new Set<string>();
  const merged: ContainerApp[] = [];
  for (const curated of curatedApps) {
    const key = containerSlugForRequest(curated.slug);
    const app = packagesBySlug.get(key) ?? curated;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(app);
  }
  for (const app of packageApps) {
    const key = containerSlugForRequest(app.slug);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(app);
  }
  return merged;
}
