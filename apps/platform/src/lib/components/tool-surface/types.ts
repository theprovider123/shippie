/**
 * ToolTile — unified primitive for every Shippie tool surface.
 *
 * Operating model: every tool surface (full launcher, in-app drawer,
 * dock rail) renders the same primitive at a different density. The
 * launcher is dark, the drawer is cream — but both inherit those
 * palettes from the parent shell via CSS tokens, so the primitive
 * itself is palette-agnostic.
 *
 * Data sources differ — the marketplace home renders rows from a SQL
 * query (`LauncherApp`-shaped), the container drawer renders curated
 * `ContainerApp` rows from `lib/container/state.ts`. The adapters in
 * `./adapters.ts` flatten both into this normalised shape.
 */

import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
import type { AppKind } from '$lib/types/app-kind';

/**
 * Tier reflects who can see the tool. Drives the corner pill in the
 * drawer / dashboard. Public tools omit this entirely.
 */
export type ToolTier = 'private' | 'team' | 'local' | 'unlisted' | 'public';

/**
 * Drawer-only runtime state. Tells the user which tile is the
 * currently-focused tool versus which other tools are warm but in the
 * background.
 */
export type ToolRuntimeState = 'idle' | 'current' | 'live' | 'opening';

/**
 * Density picks the visual treatment.
 *  - `dock`: 66px square, single-line name. Saved rail on the homepage.
 *  - `drawer`: 52px icon + name + one small status line + pin star.
 *    Compressed row inside the focused-mode drawer.
 *  - `card`: full launcher card with eyebrow, blurb, action buttons.
 *    The marketplace home, search results, and category pages.
 */
export type ToolDensity = 'dock' | 'drawer' | 'card';

/**
 * Precomputed display fields. The adapters do the work once per app so
 * 60+ tiles don't each re-run titleCap / displayCategory /
 * normaliseBlurb / connectionBadgesFromKind on every reactive tick.
 */
export interface ToolTileDisplay {
  safeName: string;
  categoryLabel: string;
  blurb: string;
  connectionBadges: readonly import('$lib/marketplace/connection-badges').ConnectionDisclosureBadge[];
}

export interface ToolTileApp {
  slug: string;
  name: string;
  blurb?: string | null;
  category?: string | null;
  iconUrl?: string | null;
  themeColor: string;
  /** Optional emoji glyph used by curated container apps. Ignored when iconUrl is present. */
  glyph?: string | null;
  tier?: ToolTier | null;
  kind?: AppKind | null;
  firstPartySigned?: boolean;
  badges?: PublicCapabilityBadge[];
  /**
   * Precomputed display strings. Optional — when omitted, ToolTile
   * falls back to computing them inline. Adapters fill this in so tiles
   * read from cache instead of recomputing per render.
   */
  display?: ToolTileDisplay;
}

/**
 * Compatibility alias for the harmonization work. `ToolDisplay` is the
 * forward name for the static, adapter-cached display model. New code
 * uses `ToolDisplay`; the alias keeps existing `ToolTileApp` call sites
 * compiling. Drop the alias once `ToolTile.svelte` is deleted.
 * See docs/superpowers/specs/2026-06-04-dock-tools-drawer-harmonization-design.md §3.1.
 */
export type ToolDisplay = ToolTileApp;

// ---------------------------------------------------------------------------
// Dynamic tool state (harmonization contract §3) — reactive, per-device.
// Derived by the pure `toolState` selector in `./tool-state.ts`. Kept
// SEPARATE from the static ToolDisplay above: an offline/update tick
// recomputes ToolState without touching the cached display fields.
// ---------------------------------------------------------------------------

/** How the current device relates to a tool. Priority running > saved > recent > catalog. */
export type Relationship = 'running' | 'recent' | 'saved' | 'catalog';

/** Re-bucketed view of the 8-value AppDownloadState. */
export type OfflineState = 'none' | 'saving' | 'ready' | 'needs-refresh' | 'failed';

/** Collapsed view of the 3-value UpdateSeverity. */
export type UpdateState = 'none' | 'update' | 'needs-review';

/** Which actions a primitive should render for this tool, on this surface. */
export interface ToolActions {
  open: boolean;
  /** Add to Dock + ensure offline. Stays visible as Refresh/Repair when a saved copy is broken. */
  save: boolean;
  info: boolean;
  close: boolean;
  remove: boolean;
  review: boolean;
}

export interface ToolState {
  relationship: Relationship;
  offlineState: OfflineState;
  updateState: UpdateState;
  actions: ToolActions;
}
