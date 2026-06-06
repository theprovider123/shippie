/**
 * Static tool display contract shared by ToolRow and ToolCard.
 *
 * Data sources differ — the marketplace renders SQL-backed launcher
 * rows, while the Dock renders curated ContainerApp rows. The adapters
 * flatten both into this normalised shape and cache expensive display
 * strings once per app.
 */

import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
import type { AppKind } from '$lib/types/app-kind';

/**
 * Tier reflects who can see the tool. Drives the corner pill in the
 * drawer / dashboard. Public tools omit this entirely.
 */
export type ToolTier = 'private' | 'team' | 'local' | 'unlisted' | 'public';

/**
 * Precomputed display fields. The adapters do the work once per app so
 * 60+ tools don't each re-run titleCap / displayCategory /
 * normaliseBlurb / connectionBadgesFromKind on every reactive tick.
 */
export interface ToolDisplayFields {
  safeName: string;
  categoryLabel: string;
  blurb: string;
  connectionBadges: readonly import('$lib/marketplace/connection-badges').ConnectionDisclosureBadge[];
}

export interface ToolDisplay {
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
   * Precomputed display strings. Optional — when omitted, primitives
   * fall back to computing them inline. Adapters fill this in so rows
   * and cards read from cache instead of recomputing per render.
   */
  display?: ToolDisplayFields;
}

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
