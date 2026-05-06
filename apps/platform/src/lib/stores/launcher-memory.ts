import { writable } from 'svelte/store';

const STORAGE_KEY = 'shippie:launcher:v1';
const MAX_RECENTS = 12;

export interface LauncherRecent {
  slug: string;
  lastOpened: string;
}

export interface LauncherMemory {
  pinned: string[];
  recents: LauncherRecent[];
  launchCounts: Record<string, number>;
}

const DEFAULT_MEMORY: LauncherMemory = {
  pinned: [],
  recents: [],
  launchCounts: {},
};

export const launcherMemory = writable<LauncherMemory>(DEFAULT_MEMORY);

function normalize(raw: unknown): LauncherMemory {
  if (!raw || typeof raw !== 'object') return DEFAULT_MEMORY;
  const value = raw as Partial<LauncherMemory>;
  const pinned = Array.isArray(value.pinned)
    ? value.pinned.filter((slug): slug is string => typeof slug === 'string')
    : [];
  const recents = Array.isArray(value.recents)
    ? value.recents
        .filter(
          (item): item is LauncherRecent =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as LauncherRecent).slug === 'string' &&
            typeof (item as LauncherRecent).lastOpened === 'string',
        )
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
  return { pinned, recents, launchCounts };
}

function persist(next: LauncherMemory): void {
  launcherMemory.set(next);
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function hydrateLauncherMemory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    persist(normalize(raw ? JSON.parse(raw) : null));
  } catch {
    persist(DEFAULT_MEMORY);
  }
}

export function togglePinnedApp(slug: string): void {
  launcherMemory.update((memory) => {
    const exists = memory.pinned.includes(slug);
    const pinned = exists
      ? memory.pinned.filter((item) => item !== slug)
      : [slug, ...memory.pinned];
    const next = { ...memory, pinned };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  });
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  });
  return nextCount;
}
