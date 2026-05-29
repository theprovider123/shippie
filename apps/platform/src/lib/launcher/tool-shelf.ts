/**
 * Tool shelf assembler — the single source of truth for what tiles
 * appear on every launcher surface.
 *
 * Both the homepage (`/+page.server.ts`) and the focused-mode drawer
 * (`/container/+page.svelte`) call `buildToolShelf()` with their own
 * inputs (catalog source, launcher memory, runtime state) and consume
 * `ToolShelfSection[]` back. Same data, two densities.
 *
 * Sections (deliberately three, every surface):
 *   quick      Pinned + recent + the currently-active tool first.
 *              Replaces homepage `Continue` and drawer `Quick`.
 *   suggested  Algorithmic. Intent adjacency + new releases + phase
 *              hooks. Server side computes; surface fades when empty.
 *   all        Every `live` tool not already in `quick`. Replaces
 *              homepage `Browse` and drawer `Browse`/`Tools`.
 *
 * Notes:
 *   - `availability !== 'live'` is the single hide rule. `upcoming`,
 *     `archived`, and `redirect` never reach a shelf section.
 *   - Phase promotion (`world-cup`) flips listed `upcoming` slugs to
 *     `live` for that phase window; it is the only way that field is
 *     mutated.
 *   - Search/category filter applies to the full live set BEFORE
 *     section assembly so Quick stays accurate when the user types
 *     into the search box (matching pinned tools still appear in
 *     Quick, not just Browse).
 *   - Consumers must canonicalise the inputs they pass in (pinned and
 *     recent slugs that came from disk before SLUG_ALIASES landed may
 *     reference retired slugs). The helpers in `./canonical.ts` make
 *     this a one-line normalise step.
 */

import { canonicalShowcaseSlug } from '$lib/showcase-slugs';
import type {
  LauncherPhase,
  PhasePromotions,
  ToolEntry,
} from './tool-entry';

export interface ToolShelfSection {
  id: 'quick' | 'suggested' | 'all';
  title: string;
  /** Mono caption rendered under the heading. Empty when not applicable. */
  hint: string;
  tools: readonly ToolEntry[];
}

export interface ToolShelf {
  sections: readonly ToolShelfSection[];
  /** Convenience for surfaces that want to render a flat search-result list. */
  allLive: readonly ToolEntry[];
  /**
   * The canonical slug list both surfaces should render after applying
   * filters. Used by the regression test to prove homepage and drawer
   * resolve to the same visible set (modulo runtime-state ordering).
   */
  visibleSlugs: readonly string[];
}

export interface BuildToolShelfInput {
  /** Source-of-truth catalogue. Any availability mix; shelf does the filtering. */
  catalog: readonly ToolEntry[];
  /** Saved/pinned canonical slugs. Order = user pin order (most recent pin first). */
  pinnedSlugs?: readonly string[];
  /** Recently-launched canonical slugs. Order = most recent first. */
  recentSlugs?: readonly string[];
  /** Drawer-only: the currently-focused tool slug. Promoted to head of Quick. */
  activeSlug?: string | null;
  /** Drawer-only: tools currently warm in the background. */
  liveSlugs?: readonly string[];
  /** Launch phase (controls upcoming → live promotion). */
  phase?: LauncherPhase;
  /** Per-phase promotion overrides (e.g. golazo flips live during world-cup). */
  promotions?: PhasePromotions;
  /** Lower-case query. When non-empty, filters allLive AND quick. */
  query?: string;
  /** Category filter ('food-drink', etc.). When set, filters allLive. */
  categoryFilter?: string | null;
  /** Cap on Quick tiles (default 8). */
  quickCap?: number;
  /**
   * Optional hand-curated lead row. When provided, these canonical
   * slugs appear at the top of Quick (after current/live), preserving
   * the per-phase featured shelf ordering callers already maintain.
   */
  leadSlugs?: readonly string[];
  /**
   * Which curation surfaces are considered displayable on this caller.
   * Defaults to `['featured', 'arcade']` — the main launcher slate.
   * `/labs` passes `['labs']` to render the labs-only catalogue.
   * Archived surfaces are filtered separately by availability so they
   * never appear here regardless of inclusion.
   */
  includeSurfaces?: readonly ('featured' | 'arcade' | 'labs')[];
}

const DEFAULT_QUICK_CAP = 8;

function canon(slug: string): string {
  return canonicalShowcaseSlug(slug);
}

function applyAvailability(
  entry: ToolEntry,
  promotions?: PhasePromotions,
): ToolEntry {
  if (entry.availability !== 'upcoming') return entry;
  if (promotions?.promote?.includes(entry.slug)) {
    return { ...entry, availability: 'live' };
  }
  return entry;
}

function matchesQuery(entry: ToolEntry, q: string): boolean {
  if (!q) return true;
  const hay = `${entry.name} ${entry.shortName} ${entry.description} ${entry.category}`.toLowerCase();
  return hay.includes(q);
}

function matchesCategory(entry: ToolEntry, category: string | null | undefined): boolean {
  if (!category) return true;
  return entry.category === category;
}

export function buildToolShelf(input: BuildToolShelfInput): ToolShelf {
  const {
    catalog,
    pinnedSlugs = [],
    recentSlugs = [],
    activeSlug = null,
    liveSlugs = [],
    phase = 'prelaunch',
    promotions,
    query = '',
    categoryFilter = null,
    quickCap = DEFAULT_QUICK_CAP,
    leadSlugs = [],
    includeSurfaces = ['featured', 'arcade'],
  } = input;
  const surfaceAllowed = new Set(includeSurfaces);
  // Promoted slugs bypass the surface filter. Semantics: when a phase
  // promotion lifts an `upcoming` slug to `live`, it should appear on
  // launcher surfaces even if its curation entry sits in 'labs'.
  // Without this, golazo (curation: labs) would still be hidden during
  // its world-cup window despite the explicit promotion.
  const promotedSet = new Set(promotions?.promote ?? []);

  void phase; // phase reserved for future suggested-row logic
  const q = query.trim().toLowerCase();

  // 1. Canonicalise the catalogue. Skip redirect-availability entries
  //    entirely — aliased slugs are router concerns, never display
  //    concerns. If they entered the dedupe map they'd block the real
  //    canonical target from claiming its slot. Non-redirect entries
  //    win by first-occurrence; the merge in adapters.mergeCatalog
  //    ensures curated takes precedence over DB rows.
  const byCanonical = new Map<string, ToolEntry>();
  for (const raw of catalog) {
    if (raw.availability === 'redirect') continue;
    const canonicalSlug = canon(raw.slug);
    if (byCanonical.has(canonicalSlug)) continue;
    // Re-stamp the slug to its canonical form so downstream surfaces
    // never see the alias even when the source row had one.
    byCanonical.set(canonicalSlug, applyAvailability({ ...raw, slug: canonicalSlug }, promotions));
  }

  // 2. Filter to the live set. The only place that matters.
  const liveOnly: ToolEntry[] = [];
  for (const entry of byCanonical.values()) {
    if (entry.availability !== 'live') continue;
    if (
      entry.surface !== 'archived' &&
      !surfaceAllowed.has(entry.surface) &&
      !promotedSet.has(entry.slug)
    ) continue;
    if (!matchesQuery(entry, q)) continue;
    if (!matchesCategory(entry, categoryFilter)) continue;
    liveOnly.push(entry);
  }

  // 3. Quick — current/live first, then user-pinned, then recents.
  //    Canonicalise inputs and dedupe.
  const quick: ToolEntry[] = [];
  const seenInQuick = new Set<string>();
  const push = (slug: string) => {
    const canonical = canon(slug);
    if (seenInQuick.has(canonical)) return;
    const entry = byCanonical.get(canonical);
    if (!entry || entry.availability !== 'live') return;
    if (
      entry.surface !== 'archived' &&
      !surfaceAllowed.has(entry.surface) &&
      !promotedSet.has(entry.slug)
    ) return;
    if (!matchesQuery(entry, q)) return;
    if (!matchesCategory(entry, categoryFilter)) return;
    seenInQuick.add(canonical);
    quick.push(entry);
  };
  if (activeSlug) push(activeSlug);
  for (const slug of liveSlugs) push(slug);
  for (const slug of leadSlugs) push(slug);
  for (const slug of pinnedSlugs) push(slug);
  for (const slug of recentSlugs) push(slug);
  const quickCapped = quick.slice(0, Math.max(0, quickCap));

  // 4. All — every live tool not already in Quick.
  const inQuick = new Set(quickCapped.map((tool) => tool.slug));
  const all = liveOnly.filter((tool) => !inQuick.has(tool.slug));

  // 5. Suggested — placeholder. The algorithm (intent adjacency, new
  //    releases, seasonal hooks) lands in v2. Empty array keeps the
  //    section absent on both surfaces until the rule is defined.
  const suggested: ToolEntry[] = [];

  const sections: ToolShelfSection[] = [];
  if (quickCapped.length > 0) {
    sections.push({
      id: 'quick',
      title: 'Quick',
      hint: recentSlugs.length > 0 ? 'recent' : 'ready now',
      tools: quickCapped,
    });
  }
  if (suggested.length > 0) {
    sections.push({
      id: 'suggested',
      title: 'Suggested',
      hint: 'fresh',
      tools: suggested,
    });
  }
  if (all.length > 0) {
    sections.push({
      id: 'all',
      title: 'All tools',
      hint: `${all.length} tool${all.length === 1 ? '' : 's'}`,
      tools: all,
    });
  }

  return {
    sections,
    allLive: liveOnly,
    visibleSlugs: liveOnly.map((tool) => tool.slug).sort(),
  };
}
