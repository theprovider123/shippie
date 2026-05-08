/**
 * localStorage wrappers for the shopping list and its sidecars.
 *
 * Keying invariants:
 *   - `STORAGE_KEY` (existing) — the list itself, MESH-SHARED. Don't
 *     rename; older builds read this key.
 *   - `STORE_PROFILES_KEY` — per-device store profiles + aisle paths.
 *   - `ACTIVE_STORE_KEY` — the user's currently-selected store id.
 *   - `RECURRING_KEY` — per-device recurring staple specs.
 *   - `QUICK_TAP_KEY` — per-device add-frequency tally.
 *   - `HOUSEHOLD_KEY` — per-device list of housemate names. Note: in
 *     this iteration each device keeps its own roster; the assignee
 *     field on items DOES travel via the mesh, so as long as the names
 *     match across phones, household filters work.
 *   - `MEDIA_KEY` — per-device map of media id → blob (we use OPFS
 *     for the actual bytes, but localStorage holds the metadata).
 *
 * Wrap each read in a try/catch + Array.isArray guard. localStorage
 * can be JSON-poisoned by anything (browser extensions, manual edits,
 * older builds with different shapes); the worst case should be
 * "fall back to defaults", never "white screen of death".
 */
import type {
  ListItem,
  QuickTapTally,
  RecurringSpec,
  StoreProfile,
} from './types.ts';
import { DEFAULT_STORE_PROFILES } from './store-profiles.ts';

export const STORAGE_KEY = 'shippie.shopping-list.v1';
export const STORE_PROFILES_KEY = 'shippie.shopping-list.profiles.v1';
export const ACTIVE_STORE_KEY = 'shippie.shopping-list.active-store.v1';
export const RECURRING_KEY = 'shippie.shopping-list.recurring.v1';
export const QUICK_TAP_KEY = 'shippie.shopping-list.quick-tap.v1';
export const HOUSEHOLD_KEY = 'shippie.shopping-list.household.v1';

function safeRead<T>(key: string, fallback: T, validate: (raw: unknown) => raw is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validate(parsed)) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or disabled localStorage — silently swallow. The runtime
    // copy in React state still works for this session.
  }
}

export function loadList(): ListItem[] {
  return safeRead(
    STORAGE_KEY,
    [] as ListItem[],
    (raw): raw is ListItem[] => Array.isArray(raw),
  );
}

export function saveList(items: readonly ListItem[]): void {
  safeWrite(STORAGE_KEY, items);
}

export function loadProfiles(): StoreProfile[] {
  return safeRead(
    STORE_PROFILES_KEY,
    [...DEFAULT_STORE_PROFILES] as StoreProfile[],
    (raw): raw is StoreProfile[] => Array.isArray(raw) && raw.length > 0,
  );
}

export function saveProfiles(profiles: readonly StoreProfile[]): void {
  safeWrite(STORE_PROFILES_KEY, profiles);
}

export function loadActiveStoreId(): string {
  return safeRead(
    ACTIVE_STORE_KEY,
    'tesco',
    (raw): raw is string => typeof raw === 'string',
  );
}

export function saveActiveStoreId(id: string): void {
  safeWrite(ACTIVE_STORE_KEY, id);
}

export function loadRecurring(): RecurringSpec[] {
  return safeRead(
    RECURRING_KEY,
    [] as RecurringSpec[],
    (raw): raw is RecurringSpec[] => Array.isArray(raw),
  );
}

export function saveRecurring(specs: readonly RecurringSpec[]): void {
  safeWrite(RECURRING_KEY, specs);
}

export function loadTallies(): QuickTapTally[] {
  return safeRead(
    QUICK_TAP_KEY,
    [] as QuickTapTally[],
    (raw): raw is QuickTapTally[] => Array.isArray(raw),
  );
}

export function saveTallies(tallies: readonly QuickTapTally[]): void {
  safeWrite(QUICK_TAP_KEY, tallies);
}

export function loadHousehold(): string[] {
  return safeRead(
    HOUSEHOLD_KEY,
    [] as string[],
    (raw): raw is string[] => Array.isArray(raw) && raw.every((s) => typeof s === 'string'),
  );
}

export function saveHousehold(members: readonly string[]): void {
  safeWrite(HOUSEHOLD_KEY, members);
}
