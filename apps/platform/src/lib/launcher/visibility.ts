import { canonicalShowcaseSlug } from '$lib/showcase-slugs';
import { buildToolShelf } from './tool-shelf';
import type { LauncherPhase, ToolEntry } from './tool-entry';

export const LAUNCHER_WORLD_CUP_PHASE_START_MS = Date.UTC(2026, 5, 11);

export const LAUNCHER_PROMOTIONS_BY_PHASE = {
  prelaunch: { promote: ['golazo'] as readonly string[] },
  'world-cup': { promote: ['golazo'] as readonly string[] },
} as const satisfies Record<LauncherPhase, { promote: readonly string[] }>;

export function launcherPhase(now: Date = new Date()): LauncherPhase {
  return now.getTime() >= LAUNCHER_WORLD_CUP_PHASE_START_MS ? 'world-cup' : 'prelaunch';
}

export function buildLauncherVisibleSlugSet(
  catalog: readonly ToolEntry[],
  phase: LauncherPhase = launcherPhase(),
): Set<string> {
  const shelf = buildToolShelf({
    catalog,
    phase,
    promotions: LAUNCHER_PROMOTIONS_BY_PHASE[phase],
  });
  return new Set(shelf.visibleSlugs);
}

export function filterCanonicalLauncherItems<T extends { slug: string }>(
  items: readonly T[],
  visibleSlugs: ReadonlySet<string>,
): T[] {
  return items.filter((item) => {
    const canonical = canonicalShowcaseSlug(item.slug);
    if (canonical !== item.slug) return false;
    return visibleSlugs.has(canonical);
  });
}
