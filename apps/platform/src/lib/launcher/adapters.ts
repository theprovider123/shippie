/**
 * Adapters: source-shape → ToolEntry.
 *
 *   containerAppToToolEntry()  curated container packages
 *   launcherRowToToolEntry()   marketplace DB rows + bundled fallbacks
 *
 * The adapters are the only place that knows about source shapes.
 * `buildToolShelf()` consumes ToolEntry[] only.
 */

import { canonicalShowcaseSlug } from '$lib/showcase-slugs';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';
import type { ContainerApp } from '$lib/container/state';
import type { AppKind } from '$lib/types/app-kind';
import type { ToolAvailability, ToolEntry } from './tool-entry';

/**
 * Slugs that ship as curated showcases but should not appear on
 * launcher surfaces until their launch window opens. The reason this
 * collapses into one constant: previously the rule lived in
 * `+page.server.ts` (`PRELAUNCH_HIDDEN_SLUGS`) and was applied only to
 * the homepage, which is exactly why the drawer surfaced golazo while
 * the homepage hid it. Now the rule is part of the ToolEntry, so both
 * surfaces respect it.
 */
const UPCOMING_SLUGS: ReadonlySet<string> = new Set();

/** Slugs that should display at all times even if curation says archived. */
const FORCED_LIVE: ReadonlySet<string> = new Set();

/**
 * Read the surface + successor for a slug from the generated curation
 * manifest. Falls back to 'featured' for unknown slugs (third-party).
 */
function curationFor(slug: string): {
  surface: 'featured' | 'arcade' | 'labs' | 'archived';
  visibility: 'public' | 'unlisted' | 'private' | 'team' | 'local';
  successor?: string;
} {
  const entry = FIRST_PARTY_CURATION.find((c) => c.slug === slug);
  if (!entry) return { surface: 'featured', visibility: 'public' };
  return { surface: entry.surface, visibility: entry.visibility, successor: entry.successor };
}

function availabilityFor(
  rawSlug: string,
  surface: string,
  visibility: string,
  successor?: string,
): ToolAvailability {
  if (FORCED_LIVE.has(rawSlug)) return 'live';
  // Aliased slugs are router-only; never display.
  const canonical = canonicalShowcaseSlug(rawSlug);
  if (canonical !== rawSlug) return 'redirect';
  if (successor) return 'redirect';
  if (visibility !== 'public') return 'archived';
  if (UPCOMING_SLUGS.has(canonical)) return 'upcoming';
  if (surface === 'archived') return 'archived';
  return 'live';
}

/**
 * Container curated app → ToolEntry. Container source has glyph +
 * accent and lacks rich marketplace metadata (no upvotes, no iconUrl).
 */
export function containerAppToToolEntry(app: ContainerApp): ToolEntry {
  const cur = curationFor(app.slug);
  const canonical = canonicalShowcaseSlug(app.slug);
  return {
    slug: canonical,
    name: app.name,
    shortName: app.shortName,
    description: app.description,
    themeColor: app.accent,
    glyph: app.icon ?? null,
    iconUrl: null,
    category: app.category ?? 'tools',
    kind: app.appKind,
    surface: cur.surface,
    availability: availabilityFor(app.slug, cur.surface, cur.visibility, cur.successor),
    intents: {
      provides: app.permissions?.capabilities?.crossAppIntents?.provides ?? [],
      consumes: app.permissions?.capabilities?.crossAppIntents?.consumes ?? [],
    },
    firstPartySigned: true,
    redirectTo: canonical !== app.slug ? canonical : cur.successor,
  };
}

export interface LauncherRowShape {
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  themeColor: string;
  iconUrl?: string | null;
  kind?: AppKind | null;
  firstPartySigned?: boolean;
  upvoteCount?: number;
  installCount?: number;
}

/**
 * Marketplace DB / bundled fallback row → ToolEntry. Source is richer
 * (real iconUrl, install/upvote counts) but lacks the curated glyph +
 * accent. The merge in the shelf builder dedupes by canonical slug;
 * for collisions the first entry wins so callers should preferentially
 * pass the curated source first.
 */
export function launcherRowToToolEntry(row: LauncherRowShape): ToolEntry {
  const cur = curationFor(row.slug);
  const canonical = canonicalShowcaseSlug(row.slug);
  return {
    slug: canonical,
    name: row.name,
    shortName: row.name,
    description: row.tagline ?? row.description ?? `${row.name} on Shippie`,
    themeColor: row.themeColor,
    glyph: null,
    iconUrl: row.iconUrl ?? null,
    category: row.category ?? 'tools',
    kind: row.kind ?? 'local',
    surface: cur.surface,
    availability: availabilityFor(row.slug, cur.surface, cur.visibility, cur.successor),
    intents: { provides: [], consumes: [] },
    firstPartySigned: row.firstPartySigned ?? false,
    upvoteCount: row.upvoteCount,
    installCount: row.installCount,
    redirectTo: canonical !== row.slug ? canonical : cur.successor,
  };
}

/**
 * Availability priority during dedupe. When two source rows land on
 * the same canonical slug (e.g. `chiwit` from the real spec PLUS the
 * `body-metrics` / `sip-log` aliases that all canonicalise to it), we
 * keep the one with the most-displayable availability:
 *
 *   live (3) > upcoming (2) > archived (1) > redirect (0)
 *
 * Otherwise an alias source could overwrite the real canonical entry
 * and silently hide it from launcher surfaces — which is exactly the
 * split-brain bug the convergence test caught.
 */
const AVAILABILITY_RANK: Record<ToolEntry['availability'], number> = {
  live: 3,
  upcoming: 2,
  archived: 1,
  redirect: 0,
};

function preferAvailability(a: ToolEntry, b: ToolEntry): ToolEntry {
  return AVAILABILITY_RANK[a.availability] >= AVAILABILITY_RANK[b.availability] ? a : b;
}

/**
 * Build a unified catalogue from both sources, deduped by canonical
 * slug. Curated entries take precedence so the rich glyph + intent set
 * wins; DB rows fill in real iconUrl + counts when they exist.
 */
export function mergeCatalog(
  curated: readonly ContainerApp[],
  rows: readonly LauncherRowShape[],
): ToolEntry[] {
  const out = new Map<string, ToolEntry>();
  for (const app of curated) {
    const entry = containerAppToToolEntry(app);
    const existing = out.get(entry.slug);
    out.set(entry.slug, existing ? preferAvailability(existing, entry) : entry);
  }
  for (const row of rows) {
    const entry = launcherRowToToolEntry(row);
    const existing = out.get(entry.slug);
    if (!existing) {
      out.set(entry.slug, entry);
      continue;
    }
    // Existing wins on availability but borrows iconUrl + counts from
    // the DB row when those are richer.
    const winner = preferAvailability(existing, entry);
    out.set(entry.slug, {
      ...winner,
      iconUrl: winner.iconUrl ?? entry.iconUrl ?? existing.iconUrl,
      upvoteCount: entry.upvoteCount ?? winner.upvoteCount,
      installCount: entry.installCount ?? winner.installCount,
    });
  }
  return [...out.values()];
}
