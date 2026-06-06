// src/lib/container/rail-groups.ts
import {
  DOCK_RECENT_CAP,
  DOCK_RUNNING_CAP,
  DOCK_SAVED_CAP,
} from '$lib/components/tool-surface/scale';

/**
 * Adaptive Dock rail grouping (spec §4/§5). Pure + framework-free so
 * it can be unit-tested. Sources are kept distinct: Open = running tools,
 * Saved = launcher-memory.saved, Recent = unsaved/un-open recents.
 * `cached-slugs` (offline state) is deliberately NOT an input.
 */
export interface RailTool {
  slug: string;
  name: string;
  icon: string;
  accent: string;
  category?: string;
}

export interface RailGroups {
  open: RailTool[];
  saved: RailTool[];
  recent: RailTool[];
}

export function buildRailGroups(input: {
  catalog: RailTool[];
  openSlugs: string[];
  saved?: string[];
  /** Deprecated compat alias for saved. */
  pinned?: string[];
  recents: { slug: string; lastOpened: string }[];
  openCap?: number;
  savedCap?: number;
  recentCap?: number;
}): RailGroups {
  const openCap = input.openCap ?? DOCK_RUNNING_CAP;
  const savedCap = input.savedCap ?? DOCK_SAVED_CAP;
  const recentCap = input.recentCap ?? DOCK_RECENT_CAP;
  const bySlug = new Map(input.catalog.map((t) => [t.slug, t]));
  const pick = (slug: string) => bySlug.get(slug);

  const open = input.openSlugs.map(pick).filter((t): t is RailTool => Boolean(t)).slice(0, openCap);
  const openSet = new Set(open.map((t) => t.slug));

  const savedSlugs = [...(input.saved ?? []), ...(input.pinned ?? [])].filter(
    (slug, index, all) => all.indexOf(slug) === index,
  );
  const saved = savedSlugs
    .map(pick)
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug))
    .slice(0, savedCap);
  const savedSet = new Set(saved.map((t) => t.slug));

  const recent = [...input.recents]
    .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1)) // newest first
    .map((r) => pick(r.slug))
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug) && !savedSet.has(t!.slug))
    .slice(0, recentCap);

  return { open, saved, recent };
}
