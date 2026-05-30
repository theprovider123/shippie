const INHERITED_DATA_PREFIX = 'shippie.inherited-data.v0';
const TRACKER_SCHEMA = 'shippie.local-storage-tracker.v1';
const MAX_TRACKED_KEYS = 512;
const MAX_TRACKED_KEY_LENGTH = 180;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface TrackedLocalStorageRecord {
  schema: typeof TRACKER_SCHEMA;
  appSlug: string;
  keys: string[];
  updatedAt: string;
}

interface TrackerState {
  slugs: Set<string>;
  installed: boolean;
  originalSetItem?: typeof Storage.prototype.setItem;
  originalRemoveItem?: typeof Storage.prototype.removeItem;
}

const TRACKER_STATE_KEY = '__shippieLocalStorageTrackerV1';

export function installLocalStorageKeyTracker(appSlug: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const slug = normaliseSlug(appSlug);
  if (!slug) return;

  const state = trackerState(window);
  state.slugs.add(slug);
  if (state.installed) return;
  if (typeof Storage === 'undefined' || !Storage.prototype) return;

  state.originalSetItem = Storage.prototype.setItem;
  state.originalRemoveItem = Storage.prototype.removeItem;
  state.installed = true;

  Storage.prototype.setItem = function trackedSetItem(key: string, value: string): void {
    state.originalSetItem?.call(this, key, value);
    if (this === window.localStorage) {
      for (const trackedSlug of state.slugs) rememberTouchedLocalStorageKey(trackedSlug, String(key));
    }
  };

  Storage.prototype.removeItem = function trackedRemoveItem(key: string): void {
    state.originalRemoveItem?.call(this, key);
    if (this === window.localStorage) {
      for (const trackedSlug of state.slugs) rememberTouchedLocalStorageKey(trackedSlug, String(key));
    }
  };

  patchLocalStorageInstance(window.localStorage, state);
}

export function rememberTouchedLocalStorageKey(
  appSlug: string,
  key: string,
  storage: StorageLike | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  const slug = normaliseSlug(appSlug);
  if (!slug || !storage || !isTrackableLocalStorageKey(key)) return;

  try {
    const record = readTrackedLocalStorageRecord(slug, storage) ?? {
      schema: TRACKER_SCHEMA,
      appSlug: slug,
      keys: [],
      updatedAt: new Date().toISOString(),
    };
    const nextKeys = [key, ...record.keys.filter((existing) => existing !== key)].slice(0, MAX_TRACKED_KEYS);
    storage.setItem(trackedLocalStorageKey(slug), JSON.stringify({
      ...record,
      keys: nextKeys,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Tracking improves recovery scope, but app writes must never fail
    // because the tracker cannot persist its own metadata.
  }
}

export function readTrackedLocalStorageKeys(
  appSlug: string,
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): string[] {
  const slug = normaliseSlug(appSlug);
  if (!slug || !storage) return [];
  return readTrackedLocalStorageRecord(slug, storage)?.keys ?? [];
}

export function trackedLocalStorageKey(appSlug: string): string {
  return `${INHERITED_DATA_PREFIX}:${normaliseSlug(appSlug)}:touched-local-storage`;
}

function readTrackedLocalStorageRecord(
  appSlug: string,
  storage: Pick<Storage, 'getItem'>,
): TrackedLocalStorageRecord | null {
  try {
    const raw = storage.getItem(trackedLocalStorageKey(appSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrackedLocalStorageRecord>;
    if (parsed.schema !== TRACKER_SCHEMA || parsed.appSlug !== appSlug || !Array.isArray(parsed.keys)) return null;
    return {
      schema: TRACKER_SCHEMA,
      appSlug,
      keys: parsed.keys.filter(isTrackableLocalStorageKey).slice(0, MAX_TRACKED_KEYS),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function isTrackableLocalStorageKey(key: string): boolean {
  if (!key || key.length > MAX_TRACKED_KEY_LENGTH) return false;
  if (key.startsWith(INHERITED_DATA_PREFIX)) return false;
  if (key.startsWith('shippie:connection-notice')) return false;
  if (key.startsWith('shippie:runtime-connections')) return false;
  if (key === 'shippie-install-state') return false;
  if (key === 'shippie-referral-source') return false;
  if (key === 'shippie:device-hash:v1') return false;
  return true;
}

function trackerState(host: Window & typeof globalThis): TrackerState {
  const existing = (host as unknown as Record<string, TrackerState | undefined>)[TRACKER_STATE_KEY];
  if (existing) return existing;
  const state: TrackerState = { slugs: new Set(), installed: false };
  (host as unknown as Record<string, TrackerState>)[TRACKER_STATE_KEY] = state;
  return state;
}

function patchLocalStorageInstance(storage: Storage, state: TrackerState): void {
  try {
    Object.defineProperty(storage, 'setItem', {
      configurable: true,
      value(key: string, value: string): void {
        state.originalSetItem?.call(storage, key, value);
        for (const trackedSlug of state.slugs) rememberTouchedLocalStorageKey(trackedSlug, String(key));
      },
    });
    Object.defineProperty(storage, 'removeItem', {
      configurable: true,
      value(key: string): void {
        state.originalRemoveItem?.call(storage, key);
        for (const trackedSlug of state.slugs) rememberTouchedLocalStorageKey(trackedSlug, String(key));
      },
    });
  } catch {
    // Some browsers expose Storage methods as non-configurable instance
    // properties; the prototype patch above covers those engines.
  }
}

function normaliseSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
