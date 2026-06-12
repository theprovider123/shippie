import { invalidate } from '$app/navigation';

export type CatalogSyncState = {
  version: string;
  live_count?: number;
  updated_at?: string | null;
};

export function startCatalogSync(options: {
  intervalMs?: number;
  onUpdate?: (state: CatalogSyncState) => void;
} = {}): () => void {
  if (typeof window === 'undefined') return () => {};

  const intervalMs = options.intervalMs ?? 25_000;
  // Background poll only — on a slow link it must never pile up behind
  // user-facing requests, so give it a short hard budget and bail.
  const pollTimeoutMs = 3_000;
  let stopped = false;
  let lastVersion: string | null = null;
  let inFlight = false;
  let timer: number | null = null;

  async function check() {
    if (stopped || inFlight) return;
    // Skip entirely while hidden or offline — the visibilitychange and
    // `online` listeners below re-run the check when conditions change.
    if (document.hidden || navigator.onLine === false) return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), pollTimeoutMs);
    try {
      const response = await fetch('/api/apps/catalog-state', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const state = (await response.json()) as Partial<CatalogSyncState>;
      if (!state.version) return;
      if (lastVersion === null) {
        lastVersion = state.version;
        return;
      }
      if (state.version === lastVersion) return;
      lastVersion = state.version;
      await invalidate('app:apps');
      options.onUpdate?.(state as CatalogSyncState);
    } catch {
      // Network changes (and the abort timeout above) are expected while
      // installed. The next interval or `online` event will reconcile
      // the catalogue.
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
    }
  }

  const onWake = () => {
    void check();
  };

  timer = window.setInterval(() => void check(), intervalMs);
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('online', onWake);
  void check();

  return () => {
    stopped = true;
    if (timer) window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onWake);
    window.removeEventListener('online', onWake);
  };
}
