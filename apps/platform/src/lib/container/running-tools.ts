/**
 * Running-tools resolution — the single source of truth for "what is
 * running" in the Dock.
 *
 * `openAppIds` (the container page's mounted-iframe list) is the
 * canonical running set. Historically every surface re-derived
 * "running" by mapping those ids through `launchVisibleApps` — the
 * curated/phase-filtered launcher slate — so any genuinely-mounted app
 * that curation hid (imported packages, alias-source slugs, apps an
 * admin made private mid-session) silently vanished from Running in
 * the switcher sheet, rail and dashboard while its iframe stayed
 * mounted. That divergence is the "I opened an app and it doesn't show
 * as running" bug.
 *
 * These helpers resolve running ids against the FULL app lookup
 * (curated + DB packages + imported), report ids that truly cannot be
 * resolved (so the page can reconcile them out of `openAppIds` and
 * dispose their frames), and canonicalise alias slugs for comparisons.
 * Pure + framework-free so vitest drives them directly.
 */

import { containerSlugForRequest } from '$lib/showcase-slugs';
import { categoryColorFamily } from './category-color';
import type { ContainerApp } from './state';
import type { RailTool } from './rail-groups';

export interface RunningResolution {
  /**
   * Mounted apps in `openAppIds` order (most-recently-focused first),
   * deduped by id. Never silently drops a resolvable app — curation
   * filtering is NOT applied here.
   */
  apps: ContainerApp[];
  /**
   * Ids that resolve to no installed app at all (uninstalled or
   * archived mid-session). The caller must remove these from
   * `openAppIds` and dispose any frame state so Running can't diverge
   * from what's actually mounted.
   */
  unresolvedIds: string[];
}

/**
 * Resolve the canonical running set from open ids + the full app
 * lookup (`appById` spans curated, DB-loaded and imported apps).
 */
export function resolveRunningApps(
  openAppIds: readonly string[],
  appById: ReadonlyMap<string, ContainerApp>,
): RunningResolution {
  const seen = new Set<string>();
  const apps: ContainerApp[] = [];
  const unresolvedIds: string[] = [];
  for (const id of openAppIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const app = appById.get(id);
    if (app) apps.push(app);
    else unresolvedIds.push(id);
  }
  return { apps, unresolvedIds };
}

/**
 * One conversion site from ContainerApp to the RailTool shape the rail
 * / switcher / dashboard selectors consume. Mirrors the dock page's
 * historical inline mapping exactly.
 */
export function appToRailTool(app: ContainerApp): RailTool {
  return {
    slug: app.slug,
    name: app.name,
    icon: app.icon ?? app.shortName ?? app.name.slice(0, 2),
    accent: app.themeColor ?? categoryColorFamily(app.category),
    iconUrl: app.iconUrl ?? null,
    themeColor: app.themeColor ?? categoryColorFamily(app.category),
    category: app.category,
  };
}

/**
 * Slug set for `isRunning` checks. Contains each running app's raw
 * slug AND its canonical slug (SLUG_ALIASES), so a tool tile rendered
 * under the canonical slug still reads as running when the mounted
 * app was resolved via a legacy alias slug.
 */
export function runningSlugSet(apps: readonly ContainerApp[]): ReadonlySet<string> {
  const slugs = new Set<string>();
  for (const app of apps) {
    slugs.add(app.slug);
    slugs.add(containerSlugForRequest(app.slug));
  }
  return slugs;
}

/**
 * Catalog for rail/switcher group building. `buildRailGroups` drops
 * open slugs it can't find in its catalog, so the launch-visible
 * catalog alone would hide running-but-curation-filtered apps. Append
 * the running tools that the catalog doesn't already know about —
 * they are genuinely mounted, so every surface must be able to render
 * them.
 */
export function mergeRailCatalog(
  catalog: readonly RailTool[],
  runningTools: readonly RailTool[],
): RailTool[] {
  const known = new Set(catalog.map((tool) => tool.slug));
  const merged = [...catalog];
  for (const tool of runningTools) {
    if (known.has(tool.slug)) continue;
    known.add(tool.slug);
    merged.push(tool);
  }
  return merged;
}
