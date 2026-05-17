export type LocalAppState = 'viewed' | 'saved' | 'offline_ready' | 'partial' | 'stale' | 'broken_cache';

export interface LocalAppProfile {
  slug: string;
  name: string;
  url: string;
  favorite: boolean;
  state: LocalAppState;
  openCount: number;
  firstOpenedAt: string;
  lastOpenedAt: string;
  lastSavedAt: string | null;
  lastOfflineCheckAt: string | null;
  rating: number | null;
  feedbackDraft: string | null;
}

const DB_NAME = 'shippie-local-profile';
const DB_VERSION = 1;
const STORE = 'apps';

let dbPromise: Promise<IDBDatabase> | null = null;

export function localProfileAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function recordAppOpen(input: {
  slug: string;
  name: string;
  url: string;
}): Promise<LocalAppProfile | null> {
  return updateApp(input.slug, (existing) => {
    const now = new Date().toISOString();
    return {
      ...emptyProfile(input.slug, input.name, input.url, now),
      ...(existing ?? {}),
      name: input.name,
      url: input.url,
      state: existing?.state ?? 'viewed',
      openCount: (existing?.openCount ?? 0) + 1,
      lastOpenedAt: now,
    };
  });
}

export async function setFavorite(slug: string, favorite: boolean): Promise<LocalAppProfile | null> {
  return updateApp(slug, (existing) => {
    if (!existing) return null;
    return { ...existing, favorite };
  });
}

export async function markSaved(slug: string, state: LocalAppState): Promise<LocalAppProfile | null> {
  return updateApp(slug, (existing) => {
    if (!existing) return null;
    return {
      ...existing,
      state,
      lastSavedAt: state === 'saved' || state === 'offline_ready' ? new Date().toISOString() : existing.lastSavedAt,
      lastOfflineCheckAt: new Date().toISOString(),
    };
  });
}

export async function getLocalApp(slug: string): Promise<LocalAppProfile | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = txStore(db, 'readonly').get(slug);
    req.onsuccess = () => resolve((req.result as LocalAppProfile | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('local profile read failed'));
  });
}

async function updateApp(
  slug: string,
  updater: (existing: LocalAppProfile | null) => LocalAppProfile | null,
): Promise<LocalAppProfile | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(slug);
    let next: LocalAppProfile | null = null;
    get.onsuccess = () => {
      next = updater((get.result as LocalAppProfile | undefined) ?? null);
      if (next) store.put(next);
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error ?? new Error('local profile update failed'));
  });
}

function emptyProfile(slug: string, name: string, url: string, now: string): LocalAppProfile {
  return {
    slug,
    name,
    url,
    favorite: false,
    state: 'viewed',
    openCount: 0,
    firstOpenedAt: now,
    lastOpenedAt: now,
    lastSavedAt: null,
    lastOfflineCheckAt: null,
    rating: null,
    feedbackDraft: null,
  };
}

function openDb(): Promise<IDBDatabase> {
  if (!localProfileAvailable()) return Promise.reject(new Error('indexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'slug' });
        store.createIndex('favorite', 'favorite');
        store.createIndex('lastOpenedAt', 'lastOpenedAt');
        store.createIndex('state', 'state');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('local profile open failed'));
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}
