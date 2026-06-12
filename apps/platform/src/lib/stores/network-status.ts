import { derived, readable, writable } from 'svelte/store';

/** True when the browser reports network connectivity. Seeds from navigator.onLine. */
export const isOnline = readable(true, (set) => {
  if (typeof window === 'undefined') return;
  set(navigator.onLine);
  const on = () => set(true);
  const off = () => set(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
});

/**
 * Slow-network detection. Two signals feed `isSlowNetwork`:
 *
 * 1. The Network Information API (`navigator.connection`) — saveData or a
 *    2g-class effectiveType. Chromium-only; Safari lacks the API entirely,
 *    so every access is guarded.
 * 2. The service worker posting `SLOW_NETWORK_FALLBACK` after it served a
 *    saved (stale) document because the network was too slow to answer
 *    within budget. That signal marks the network slow for a 30s episode.
 */
type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

const SLOW_EPISODE_MS = 30_000;

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function connectionIsSlow(connection: NetworkInformationLike): boolean {
  if (connection.saveData) return true;
  return connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g';
}

const connectionSlow = readable(false, (set) => {
  const connection = getConnection();
  if (!connection) return;
  const update = () => set(connectionIsSlow(connection));
  update();
  connection.addEventListener?.('change', update);
  return () => connection.removeEventListener?.('change', update);
});

const swFallbackSlow = writable(false);
let episodeTimer: ReturnType<typeof setTimeout> | null = null;
let listenerInstalled = false;

/**
 * Mark the network slow for one episode (30s). Each new signal extends
 * the window. Called by the SW message listener; exported so tests and
 * other fallback paths can feed the same signal.
 */
export function noteSlowNetworkFallback(): void {
  swFallbackSlow.set(true);
  if (episodeTimer) clearTimeout(episodeTimer);
  episodeTimer = setTimeout(() => {
    episodeTimer = null;
    swFallbackSlow.set(false);
  }, SLOW_EPISODE_MS);
}

/**
 * Listen for `SLOW_NETWORK_FALLBACK` messages from the platform service
 * worker (posted after it serves a saved document because the network
 * blew its time budget). Install once from the root layout — same
 * pattern as `installOfflineRepairLoop` in cached-slugs.
 */
export function installSlowNetworkListener(): void {
  if (listenerInstalled || typeof navigator === 'undefined') return;
  listenerInstalled = true;
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string } | undefined;
    if (data?.type === 'SLOW_NETWORK_FALLBACK') noteSlowNetworkFallback();
  });
}

/**
 * True while the connection looks too slow to be useful — either the
 * Network Information API says so, or the SW recently had to serve a
 * saved copy because the network timed out.
 */
export const isSlowNetwork = derived(
  [connectionSlow, swFallbackSlow],
  ([$connection, $fallback]) => $connection || $fallback,
);
