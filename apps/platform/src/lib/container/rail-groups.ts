// src/lib/container/rail-groups.ts
/**
 * Adaptive workspace-rail grouping (spec §4/§5). Pure + framework-free so
 * it can be unit-tested. Sources are kept distinct: Open = running tools,
 * Pinned = launcher-memory.pinned, Recent = unpinned/un-open recents.
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
  pinned: RailTool[];
  recent: RailTool[];
}

export function buildRailGroups(input: {
  catalog: RailTool[];
  openSlugs: string[];
  pinned: string[];
  recents: { slug: string; lastOpened: string }[];
  recentCap?: number;
}): RailGroups {
  const cap = input.recentCap ?? 5;
  const bySlug = new Map(input.catalog.map((t) => [t.slug, t]));
  const pick = (slug: string) => bySlug.get(slug);

  const open = input.openSlugs.map(pick).filter((t): t is RailTool => Boolean(t));
  const openSet = new Set(open.map((t) => t.slug));

  const pinned = input.pinned
    .map(pick)
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug));
  const pinnedSet = new Set(pinned.map((t) => t.slug));

  const recent = [...input.recents]
    .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1)) // newest first
    .map((r) => pick(r.slug))
    .filter((t): t is RailTool => Boolean(t) && !openSet.has(t!.slug) && !pinnedSet.has(t!.slug))
    .slice(0, cap);

  return { open, pinned, recent };
}
