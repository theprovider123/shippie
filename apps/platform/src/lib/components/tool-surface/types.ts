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
}
