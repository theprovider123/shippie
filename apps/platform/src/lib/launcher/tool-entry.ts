/**
 * Canonical tool surface model.
 *
 * Before this module existed, the homepage and the focused-mode drawer
 * each computed their visible-app set from different sources (homepage
 * = marketplace DB rows + bundled fallbacks; drawer = curated container
 * packages + launcher memory). That produced the split-brain behaviour
 * users reported: golazo visible in the drawer but hidden on the
 * homepage; Recipe Saver / Cooking / Pantry Scanner appearing on the
 * homepage even though `/run/recipe/` 302s to `/run/palate/`.
 *
 * Both surfaces now flatten into `ToolEntry[]` via the adapters in
 * `./adapters.ts` and run through `buildToolShelf()` in `./tool-shelf.ts`.
 * One canonical app set, one availability model, one rule for what's
 * shown where.
 */

import type { AppKind } from '$lib/types/app-kind';
import type { CurationSurface } from '$lib/_generated/first-party-curation';

/**
 * Availability is the single answer to "should this tile render?"
 *
 *   live      Visible on every surface that respects launch rules.
 *   upcoming  Hidden from launcher surfaces until the launch phase
 *             promotes it. Direct URL still resolves so previews work.
 *             (Golazo lived here before its World Cup window opened.)
 *   archived  Hidden everywhere. Bundle still bakes; the URL still
 *             resolves so old saved links work. Marketplace listings
 *             must not include it.
 *   redirect  Slug points at a different canonical via SLUG_ALIASES.
 *             Never displayed as its own tile; only used by router.
 */
export type ToolAvailability = 'live' | 'upcoming' | 'archived' | 'redirect';

export interface ToolEntryIntents {
  provides: readonly string[];
  consumes: readonly string[];
}

export interface ToolEntry {
  /** Canonical slug — post-alias. The display-side identity. */
  slug: string;
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  /** Emoji or short glyph used when no iconUrl is bundled (curated apps). */
  glyph?: string | null;
  iconUrl?: string | null;
  category: string;
  kind: AppKind;
  /** Slate-curation surface (drives /arcade etc., NOT visibility). */
  surface: CurationSurface;
  /** Single field replacing PRELAUNCH_HIDDEN_SLUGS + scattered hide rules. */
  availability: ToolAvailability;
  intents: ToolEntryIntents;
  /** True when bundled by Shippie (first-party); used for trust badges. */
  firstPartySigned: boolean;
  /** Only set when availability === 'redirect'. */
  redirectTo?: string;
  /** Optional ordering counts when shelf needs them (browse sort). */
  upvoteCount?: number;
  installCount?: number;
}

/**
 * Launch phase passed through to `buildToolShelf` — controls how
 * `upcoming` is treated. The decision rule lives in shelf, not
 * scattered in each consumer's load() function.
 */
export type LauncherPhase = 'prelaunch' | 'world-cup';

/**
 * Per-phase availability overrides. `upcoming` slugs that are listed
 * here graduate to `live` for the phase window. Anything not listed
 * stays at whatever the source set.
 */
export interface PhasePromotions {
  /** Slugs whose availability flips from `upcoming` → `live` in this phase. */
  promote?: readonly string[];
}
