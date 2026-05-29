/**
 * Shared client-side state: which showcase slugs are fully saved for
 * offline use. Marketplace cards subscribe to render the
 * "Offline-ready" badge; the Save / Remove buttons mutate via the
 * track helpers so all card instances stay in sync without per-card
 * SW round-trips.
 *
 * This is the single source of truth for the UI. The SW remains the
 * single source of truth for actual cache state — `refreshCachedSlugs`
 * reconciles the store against the SW on demand (mount, post-deploy,
 * after a successful download/remove).
 */
import { get, writable } from 'svelte/store';
import {
  type AppDownloadProgress,
  clearOfflineApps,
  downloadApp,
  getAppStatus,
  listSavedAppDetails,
  removeApp,
} from '$lib/offline/download-app';

export const cachedSlugs = writable<Set<string>>(new Set());
export const offlineStatuses = writable<Record<string, AppDownloadProgress>>({});

const inFlight = new Map<string, Promise<AppDownloadProgress>>();

function setOfflineStatus(slug: string, progress: AppDownloadProgress): void {
  offlineStatuses.update((statuses) => ({ ...statuses, [slug]: progress }));
}

/**
 * Reconcile the store against the SW for the given slug list. Called
 * once on `/apps` mount. Best-effort — if the SW isn't active yet,
 * leaves the store as-is and lets the caller try again later.
 */
export async function refreshCachedSlugs(slugs: readonly string[]): Promise<void> {
  if (slugs.length === 0) return;

  // Bulk refresh happens on launcher mount. A per-slug manifest check
  // creates dozens of network requests and makes missing/retired bakes
  // very noisy. Ask the SW to scan its cache once, then only deep-check
  // tiny candidate sets where a user-facing state needs proof.
  if (slugs.length > 12) {
    const allowed = new Set(slugs);
    const saved = (await listSavedAppDetails()).filter((app) => allowed.has(app.slug) && app.state === 'saved');
    cachedSlugs.set(new Set(saved.map((app) => app.slug)));
    offlineStatuses.update((statuses) => {
      const next = { ...statuses };
      for (const app of saved) {
        next[app.slug] = {
          slug: app.slug,
          state: 'saved',
          phase: 'sealed',
          done: 0,
          total: 0,
          totalBytes: app.totalBytes,
          manifestHash: app.manifestHash,
        };
      }
      return next;
    });
    return;
  }

  const next = new Set<string>();
  const results = await Promise.allSettled(slugs.map((slug) => getAppStatus(slug)));
  for (let i = 0; i < slugs.length; i += 1) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      setOfflineStatus(slugs[i], r.value);
      if (r.value.state === 'saved') next.add(slugs[i]);
    }
  }
  cachedSlugs.set(next);
}

/**
 * Download an app and update the store on success. Throws if the
 * download errors (caller should surface via toast).
 */
export async function downloadAppAndTrack(
  slug: string,
  onProgress?: (p: AppDownloadProgress) => void,
): Promise<AppDownloadProgress> {
  setOfflineStatus(slug, { slug, state: 'downloading', done: 0, total: 0 });
  const result = await downloadApp(slug, (progress) => {
    setOfflineStatus(slug, progress);
    onProgress?.(progress);
  });
  setOfflineStatus(slug, result);
  if (result.state === 'saved') {
    cachedSlugs.update((s) => {
      if (s.has(slug)) return s;
      const next = new Set(s);
      next.add(slug);
      return next;
    });
  }
  return result;
}

export function ensureAppOffline(slug: string): Promise<AppDownloadProgress> {
  const current = get(offlineStatuses)[slug];
  if (current?.state === 'saved' || get(cachedSlugs).has(slug)) {
    return Promise.resolve(current ?? { slug, state: 'saved', done: 0, total: 0 });
  }
  const existing = inFlight.get(slug);
  if (existing) return existing;
  const run = downloadAppAndTrack(slug).finally(() => {
    inFlight.delete(slug);
  });
  inFlight.set(slug, run);
  return run;
}

export function forgetCachedSlug(slug: string): void {
  setOfflineStatus(slug, { slug, state: 'idle', done: 0, total: 0 });
  cachedSlugs.update((s) => {
    if (!s.has(slug)) return s;
    const next = new Set(s);
    next.delete(slug);
    return next;
  });
}

export async function removeAppAndTrack(slug: string): Promise<void> {
  try {
    await removeApp(slug);
  } finally {
    forgetCachedSlug(slug);
  }
}

export async function clearOfflineAndTrack(): Promise<void> {
  await clearOfflineApps();
  offlineStatuses.set({});
  cachedSlugs.set(new Set());
}
