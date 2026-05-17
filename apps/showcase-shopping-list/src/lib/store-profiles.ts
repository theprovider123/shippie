/**
 * Store profiles — the per-chain aisle paths.
 *
 * Real shoppers walk a store on a roughly fixed path. Tesco superstores
 * usually start at fresh produce, then dairy/chilled, bakery, meat,
 * frozen, then ambient pantry shelves, beverages, snacks, and end at
 * non-food (household, pharmacy). Aldi pushes ambient pantry up front,
 * frozen near the centre, and chilled at the end. Whole Foods leads
 * with produce → bakery → prepared/deli → dairy → meat → frozen →
 * pantry. These are *defaults*, not gospel — the user can drag-reorder
 * in Settings, and stores vary store-to-store. The point is "good
 * enough that switching profile noticeably resorts the list."
 *
 * The active-store ID is per-device (each shopper has a default), so
 * we DO NOT broadcast it over the mesh. Profiles themselves are also
 * per-device in this iteration — keeping shared state minimal.
 */
import type { Aisle } from '../AisleClassifier.tsx';
import type { StoreProfile } from './types.ts';

/**
 * The full enumerated aisle list. We pull from AisleClassifier to keep
 * a single source of truth — re-exported here so callers don't have to
 * dig into the classifier module just to know what an Aisle is.
 */
export const KNOWN_AISLES: readonly Aisle[] = [
  'produce',
  'bakery',
  'dairy',
  'meat',
  'frozen',
  'pantry',
  'beverages',
  'snacks',
  'household',
  'pharmacy',
  'unsorted',
];

/**
 * Built-in store profiles. The IDs are stable — they're persisted to
 * localStorage when the user picks a default. New chains can be added
 * here without breaking saved selections (unknown ids fall back to
 * 'generic' at read time).
 */
export const DEFAULT_STORE_PROFILES: readonly StoreProfile[] = [
  {
    id: 'tesco',
    name: 'Tesco',
    aislePath: [
      'produce',
      'bakery',
      'dairy',
      'meat',
      'frozen',
      'pantry',
      'beverages',
      'snacks',
      'household',
      'pharmacy',
      'unsorted',
    ],
  },
  {
    id: 'sainsburys',
    name: "Sainsbury's",
    aislePath: [
      'produce',
      'bakery',
      'meat',
      'dairy',
      'pantry',
      'frozen',
      'beverages',
      'snacks',
      'household',
      'pharmacy',
      'unsorted',
    ],
  },
  {
    id: 'aldi',
    name: 'Aldi',
    aislePath: [
      'pantry',
      'snacks',
      'beverages',
      'produce',
      'bakery',
      'frozen',
      'dairy',
      'meat',
      'household',
      'pharmacy',
      'unsorted',
    ],
  },
  {
    id: 'whole-foods',
    name: 'Whole Foods',
    aislePath: [
      'produce',
      'bakery',
      'dairy',
      'meat',
      'pantry',
      'frozen',
      'beverages',
      'snacks',
      'household',
      'pharmacy',
      'unsorted',
    ],
  },
  {
    id: 'generic',
    name: 'Generic',
    aislePath: [
      'produce',
      'bakery',
      'dairy',
      'meat',
      'frozen',
      'pantry',
      'beverages',
      'snacks',
      'household',
      'pharmacy',
      'unsorted',
    ],
  },
];

/** Resolve a profile by id; falls back to 'generic'. */
export function getProfile(
  profiles: readonly StoreProfile[],
  id: string | null,
): StoreProfile {
  const fallback = profiles.find((p) => p.id === 'generic') ?? profiles[0]!;
  if (!id) return fallback;
  return profiles.find((p) => p.id === id) ?? fallback;
}

/**
 * Build a complete aisle path: prepend the user's pinned order,
 * then append any aisles missing from it. This makes the function
 * resilient to drift between a saved (older) aisle path and the
 * current AISLES enum.
 */
export function fullAislePath(profile: StoreProfile): readonly Aisle[] {
  const seen = new Set<Aisle>();
  const out: Aisle[] = [];
  for (const a of profile.aislePath) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  for (const a of KNOWN_AISLES) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** Return the index of an aisle in the profile's path; unknown → end. */
export function aisleIndex(profile: StoreProfile, aisle: Aisle): number {
  const path = fullAislePath(profile);
  const idx = path.indexOf(aisle);
  return idx < 0 ? path.length : idx;
}

/**
 * Reorder a profile's aisle path by moving `from` to `to`. Pure —
 * returns a new profile, leaves the input untouched.
 */
export function reorderAisles(
  profile: StoreProfile,
  from: number,
  to: number,
): StoreProfile {
  const path = [...fullAislePath(profile)];
  if (from < 0 || from >= path.length || to < 0 || to >= path.length) {
    return profile;
  }
  const [moved] = path.splice(from, 1);
  if (!moved) return profile;
  path.splice(to, 0, moved);
  return { ...profile, aislePath: path };
}

/**
 * Replace one profile in a list (by id), or append it if not present.
 * Used when the user customises an aisle path.
 */
export function upsertProfile(
  profiles: readonly StoreProfile[],
  next: StoreProfile,
): readonly StoreProfile[] {
  const idx = profiles.findIndex((p) => p.id === next.id);
  if (idx < 0) return [...profiles, next];
  const out = [...profiles];
  out[idx] = next;
  return out;
}
