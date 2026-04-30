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
import { writable } from 'svelte/store';
import {
  type AppDownloadProgress,
  clearOfflineApps,
  downloadApp,
  getAppStatus,
  removeApp,
} from '$lib/offline/download-app';

export const cachedSlugs = writable<Set<string>>(new Set());

/**
 * Reconcile the store against the SW for the given slug list. Called
 * once on `/apps` mount. Best-effort — if the SW isn't active yet,
 * leaves the store as-is and lets the caller try again later.
 */
export async function refreshCachedSlugs(slugs: readonly string[]): Promise<void> {
  if (slugs.length === 0) return;
  const next = new Set<string>();
  const results = await Promise.allSettled(slugs.map((slug) => getAppStatus(slug)));
  for (let i = 0; i < slugs.length; i += 1) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.state === 'saved') {
      next.add(slugs[i]);
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
  const result = await downloadApp(slug, onProgress);
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

export async function removeAppAndTrack(slug: string): Promise<void> {
  await removeApp(slug);
  cachedSlugs.update((s) => {
    if (!s.has(slug)) return s;
    const next = new Set(s);
    next.delete(slug);
    return next;
  });
}

export async function clearOfflineAndTrack(): Promise<void> {
  await clearOfflineApps();
  cachedSlugs.set(new Set());
}
