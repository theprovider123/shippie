/**
 * Shared types for the Shopping List polish layer.
 *
 * The `ListItem` shape is the load-bearing one — it's persisted, it's
 * mesh-shared (existing proximity Group broadcasts), and the merge
 * layer touches it. Newly added fields (`assignee`, `price`,
 * `photoRef`, `voiceRef`, `recurringSpecId`, `aisleOverride`, `qty`,
 * `note`) are all optional so older snapshots from peers running
 * pre-polish builds still merge cleanly.
 */
import type { Aisle } from '../AisleClassifier.tsx';

/**
 * Source of an item — purely informational, but also drives the badge
 * colour in the list and is helpful for debugging mesh syncs.
 */
export type ItemSource = 'meal-plan' | 'manual' | 'mesh' | 'pantry-low' | 'recurring' | 'photo' | 'voice';

/**
 * Household assignee. `null` (or absent) means "anyone can grab this".
 * The list of household members is configured in Settings and synced
 * via the existing mesh — see HouseholdFilter for the surface.
 */
export type Assignee = string | null;

/**
 * Lightweight reference to a captured photo or voice note. The blob
 * itself lives in OPFS keyed by `id`; this struct just carries the
 * metadata the list needs to render a thumbnail or play indicator
 * without blocking on disk reads.
 *
 * `dataUrl` is the in-memory cached preview (set on capture). It is
 * NOT persisted to localStorage — only `id` is. On reload we either
 * re-read the OPFS blob lazily or render a generic icon. This avoids
 * blowing localStorage past the 5MB browser cap with base64 photos.
 */
export interface MediaRef {
  /** Stable id used as the OPFS file name. */
  id: string;
  /** Either 'photo' or 'voice'. */
  kind: 'photo' | 'voice';
  /** MIME type for re-rendering. */
  mime: string;
  /** Captured size in bytes — handy for the UI to flag huge files. */
  size: number;
  /** Preview data URL — runtime-only, not persisted. */
  dataUrl?: string;
}

export interface PriceObservation {
  /** Store profile id this price was observed at. */
  storeId: string;
  /** Pence (or smallest currency unit) — keep ints to avoid float drift. */
  pence: number;
  /** ISO timestamp the price was logged. */
  observedAt: string;
}

/**
 * The canonical Shopping List item.
 *
 * Backwards-compat note: pre-polish peers won't send the new fields,
 * which is fine — every new field is optional, and the merge layer
 * uses `name`-keying for de-dup, not field shape.
 */
export interface ListItem {
  id: string;
  name: string;
  checked: boolean;
  source: ItemSource;
  addedAt: string;
  /** Optional household assignee — null/undefined = "anyone". */
  assignee?: Assignee;
  /** Quantity, e.g. "× 2", "500g". Free-text on purpose. */
  qty?: string;
  /** Free-form note ("the smooth one Tom likes"). */
  note?: string;
  /** Optional captured media — photo or voice. */
  media?: MediaRef;
  /** If this item was emitted by a recurring staple, its spec id. */
  recurringSpecId?: string;
  /** User-pinned aisle; overrides classifier output for this name. */
  aisleOverride?: Aisle;
  /** Latest known prices per store. Append-only; rotate manually. */
  prices?: readonly PriceObservation[];
}

/** A recurring staple specification — how often it should reappear. */
export interface RecurringSpec {
  id: string;
  name: string;
  /** Days between auto-adds. Default 7. */
  cadenceDays: number;
  /** ISO timestamp of the last time this spec last queued an item. */
  lastQueuedAt: string | null;
  /** ISO timestamp of the last time the user actually bought it. */
  lastBoughtAt: string | null;
  /** If true, suppress auto-queueing. */
  paused?: boolean;
}

/**
 * A user-editable store profile. The defaults live in
 * `store-profiles.ts`; this struct represents the *user's* current
 * version, which may have a re-ordered aisle path.
 */
export interface StoreProfile {
  id: string;
  name: string;
  /** Ordered aisle path — first aisle the shopper walks through to last. */
  aislePath: readonly Aisle[];
  /** True for the user's currently active store. */
  active?: boolean;
}

/** Tally for quick-tap chip ordering — what does the user add the most? */
export interface QuickTapTally {
  name: string;
  /** Total times added across all sources except mesh+meal-plan. */
  count: number;
  /** ISO timestamp of last add — tiebreak by recency. */
  lastAddedAt: string;
}
