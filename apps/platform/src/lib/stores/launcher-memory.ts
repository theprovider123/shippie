import { writable } from 'svelte/store';

const STORAGE_KEY = 'shippie:launcher:v1';
const COOKIE_KEY = 'shippie_launcher';
const MAX_RECENTS = 12;

export interface LauncherRecent {
  slug: string;
  lastOpened: string;
}

export interface LauncherMemory {
  /** Product source of truth: tools saved to Dock. Saved also means
   * "try to keep an offline capsule"; offline-ready is still derived
   * from cached-slugs / SW state, not this flag. */
  saved: string[];
  /** Deprecated compat alias. Kept so old cookies/localStorage and older
   * callers do not break during the Dock migration. Mirrors `saved`. */
  pinned: string[];
  recents: LauncherRecent[];
  launchCounts: Record<string, number>;
}

const DEFAULT_MEMORY: LauncherMemory = {
  saved: [],
  pinned: [],
  recents: [],
  launchCounts: {},
};

export const launcherMemory = writable<LauncherMemory>(DEFAULT_MEMORY);

/**
 * Mirror a save/remove to the account-scoped dock (cross-device).
 * Fire-and-forget: localStorage already holds the change, so a failed or
 * offline sync never blocks the UI. The session cookie authenticates;
 * anonymous users 401 and stay local-only. Browser-only.
 */
function syncDockChange(slug: string, action: 'save' | 'remove'): void {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return;
  void fetch('/api/dock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, action }),
    keepalive: true,
  }).catch(() => {
    // Offline / signed-out: local save stands; next online load reconciles.
  });
}

/**
 * Merge the account dock (from the server load) into local memory on
 * hydrate: union local + server-saved, minus server tombstones, so a
 * cross-device add AND remove both land. Writes the merged set back so
 * the local store and the account agree. Recents/launch counts are
 * device-personal and never touched.
 */
export function mergeAccountDock(saved: string[], removed: string[]): void {
  const removedSet = new Set(removed);
  launcherMemory.update((memory) => {
    const union: string[] = [];
    const seen = new Set<string>();
    // Server-saved first (newest-first from the query), then any
    // local-only saves not yet mirrored — both filtered by tombstones.
    for (const slug of [...saved, ...memory.saved]) {
      if (seen.has(slug) || removedSet.has(slug)) continue;
      seen.add(slug);
      union.push(slug);
    }
    if (union.length === memory.saved.length && union.every((s, i) => s === memory.saved[i])) {
      return memory; // No change — avoid a redundant write.
    }
    const next = { ...memory, saved: union, pinned: union };
    writeStoredMemory(next);
    return next;
  });
}

function readStoredMemory(): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return raw;
    } catch {
      // Fall through to cookie backup.
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const found = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE_KEY}=`));
      if (found) return decodeURIComponent(found.slice(COOKIE_KEY.length + 1));
    } catch {
      // No durable storage available.
    }
  }
  return null;
}

function writeStoredMemory(next: LauncherMemory): void {
  const raw = JSON.stringify(next);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      // Storage can be blocked or quota-limited on some mobile browsers.
      // The in-memory store still updates so the UI responds immediately.
    }
  }
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${COOKIE_KEY}=${encodeURIComponent(raw)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    } catch {
      // Cookie backup is best-effort too.
    }
  }
}

function normalize(raw: unknown): LauncherMemory {
  if (!raw || typeof raw !== 'object') return DEFAULT_MEMORY;
  const value = raw as Partial<LauncherMemory>;
  const rawSaved = [
    ...(Array.isArray(value.saved) ? value.saved : []),
    ...(Array.isArray(value.pinned) ? value.pinned : []),
  ];
  const saved = rawSaved
    .filter((slug): slug is string => typeof slug === 'string')
    .filter((slug, index, all) => all.indexOf(slug) === index);
  const recents = Array.isArray(value.recents)
    ? value.recents
        .map(normalizeRecent)
        .filter((item): item is LauncherRecent => Boolean(item))
        .slice(0, MAX_RECENTS)
    : [];
  const launchCounts =
    value.launchCounts && typeof value.launchCounts === 'object'
      ? Object.fromEntries(
          Object.entries(value.launchCounts).filter(
            ([slug, count]) => typeof slug === 'string' && typeof count === 'number' && Number.isFinite(count),
          ),
        )
      : {};
  return { saved, pinned: saved, recents, launchCounts };
}

function normalizeRecent(raw: unknown): LauncherRecent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { slug?: unknown; lastOpened?: unknown; launchedAt?: unknown };
  if (typeof value.slug !== 'string' || !value.slug) return null;
  if (typeof value.lastOpened === 'string' && value.lastOpened) {
    return { slug: value.slug, lastOpened: value.lastOpened };
  }
  if (typeof value.launchedAt === 'number' && Number.isFinite(value.launchedAt)) {
    return { slug: value.slug, lastOpened: new Date(value.launchedAt).toISOString() };
  }
  if (typeof value.launchedAt === 'string' && value.launchedAt) {
    const numeric = Number(value.launchedAt);
    return {
      slug: value.slug,
      lastOpened: Number.isFinite(numeric) ? new Date(numeric).toISOString() : value.launchedAt,
    };
  }
  return null;
}

function persist(next: LauncherMemory): void {
  const normalized = normalize(next);
  launcherMemory.set(normalized);
  writeStoredMemory(normalized);
}

export function hydrateLauncherMemory(): void {
  try {
    const raw = readStoredMemory();
    persist(normalize(raw ? JSON.parse(raw) : null));
  } catch {
    persist(DEFAULT_MEMORY);
  }
}

export function togglePinnedApp(slug: string): void {
  toggleSavedApp(slug);
}

export function saveAppToDock(slug: string): void {
  launcherMemory.update((memory) => {
    if (memory.saved.includes(slug)) return memory;
    const saved = [slug, ...memory.saved];
    const next = { ...memory, saved, pinned: saved };
    writeStoredMemory(next);
    syncDockChange(slug, 'save');
    return next;
  });
}

export function removeSavedApp(slug: string): void {
  launcherMemory.update((memory) => {
    if (!memory.saved.includes(slug) && !memory.pinned.includes(slug)) return memory;
    const saved = memory.saved.filter((item) => item !== slug);
    const next = { ...memory, saved, pinned: saved };
    writeStoredMemory(next);
    syncDockChange(slug, 'remove');
    return next;
  });
}

export function forgetRecentApp(slug: string): void {
  launcherMemory.update((memory) => {
    if (!memory.recents.some((item) => item.slug === slug)) return memory;
    const recents = memory.recents.filter((item) => item.slug !== slug);
    const next = { ...memory, recents };
    writeStoredMemory(next);
    return next;
  });
}

export function toggleSavedApp(slug: string): void {
  launcherMemory.update((memory) => {
    const exists = memory.saved.includes(slug) || memory.pinned.includes(slug);
    const saved = exists
      ? memory.saved.filter((item) => item !== slug)
      : [slug, ...memory.saved];
    const next = { ...memory, saved, pinned: saved };
    writeStoredMemory(next);
    syncDockChange(slug, exists ? 'remove' : 'save');
    return next;
  });
}

export function clearLauncherMemory(): void {
  persist(DEFAULT_MEMORY);
}

export function recordAppLaunch(slug: string, now = new Date()): number {
  let nextCount = 1;
  launcherMemory.update((memory) => {
    nextCount = (memory.launchCounts[slug] ?? 0) + 1;
    const recents = [
      { slug, lastOpened: now.toISOString() },
      ...memory.recents.filter((item) => item.slug !== slug),
    ].slice(0, MAX_RECENTS);
    const next = {
      ...memory,
      recents,
      launchCounts: { ...memory.launchCounts, [slug]: nextCount },
    };
    writeStoredMemory(next);
    return next;
  });
  return nextCount;
}
