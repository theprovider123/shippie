/**
 * Page-side thin client for the marketplace SW's save-for-offline
 * handlers (sw.js/+server.ts:DOWNLOAD_APP / REMOVE_APP /
 * GET_APP_STATUS / CLEAR_OFFLINE).
 *
 * The SW owns all caching authority — its cache name is stamped from
 * CF_VERSION_METADATA at request time and isn't reliably exposed to
 * page code. So this module never touches `caches.*` directly. Instead,
 * each function opens a MessageChannel, posts a typed message to the
 * active SW with port2 attached, and consumes progress + done events
 * on port1.
 *
 * If no SW is active yet (page just loaded, controller is null), we fall
 * back to the ready registration's active worker where possible. Download
 * requests also ask the browser for the newest SW first so old controlled
 * tabs do not keep using stale cache-manifest paths after a deploy.
 */

export type AppDownloadState = 'idle' | 'requested' | 'downloading' | 'verifying' | 'partial' | 'saved' | 'evicted' | 'error';
export type AppDownloadPhase = 'idle' | 'requested' | 'downloading' | 'verifying' | 'sealed' | 'partial' | 'evicted' | 'error';
export type OfflineHealthState =
  | 'not_saved'
  | 'saving'
  | 'repairing'
  | 'ready'
  | 'needs_connection'
  | 'needs_refresh'
  | 'failed';

export interface AppDownloadProgress {
  slug: string;
  state: AppDownloadState;
  phase?: AppDownloadPhase;
  done: number;
  total: number;
  totalBytes?: number;
  manifestHash?: string;
  failedUrls?: string[];
  error?: string;
  repairing?: boolean;
  updatedAt?: string;
  sealedAt?: string;
}

const NO_SW_ERROR =
  'Service worker is not active yet. Reload Shippie online once and try again.';

/**
 * Wrap a SW MessageChannel exchange in a timeout. Without it a wedged
 * service worker (mid-update, throttled tab) can leave the UI hanging
 * on Save / Remove forever. Downloads get a longer ceiling because
 * large capsules legitimately take a while; status probes get a tight
 * one because they should reply within a few hundred ms.
 */
function withSwTimeout<T>(
  fn: (resolve: (value: T) => void, reject: (error: Error) => void) => void,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = (typeof window === 'undefined' ? setTimeout : window.setTimeout)(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`sw_timeout_${label}`));
    }, ms);
    fn(
      (value) => {
        if (settled) return;
        settled = true;
        (typeof window === 'undefined' ? clearTimeout : window.clearTimeout)(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        (typeof window === 'undefined' ? clearTimeout : window.clearTimeout)(timer);
        reject(error);
      },
    );
  });
}

declare global {
  interface Window {
    __shippieSuppressNextControllerReload?: boolean;
  }
}

async function getActiveSw(options: { ensureLatest?: boolean } = {}): Promise<ServiceWorker> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    throw new Error(NO_SW_ERROR);
  }
  const registration = await navigator.serviceWorker.ready;
  if (options.ensureLatest) {
    await refreshMarketplaceSw(registration);
  }
  const sw = navigator.serviceWorker.controller ?? registration.active;
  if (!sw) throw new Error(NO_SW_ERROR);
  return sw;
}

async function refreshMarketplaceSw(registration: ServiceWorkerRegistration): Promise<void> {
  let nextRegistration = registration;
  try {
    nextRegistration = await registration.update();
  } catch {
    /* best effort — the current active worker can still handle the request */
  }

  const waiting = nextRegistration.waiting;
  if (!waiting) return;

  // app.html normally reloads on controllerchange so users pick up fresh
  // chunks. For an explicit Save action we want the new worker to claim this
  // page and then continue the MessageChannel request in place.
  window.__shippieSuppressNextControllerReload = true;
  const claimed = new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    }, 4000);
    function onControllerChange() {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });
  waiting.postMessage('SKIP_WAITING');
  await claimed;
}

interface SwProgressMessage {
  type: 'progress';
  slug: string;
  phase?: AppDownloadPhase;
  done: number;
  total: number;
}

interface SwDoneMessage {
  type: 'done';
  state: 'saved' | 'partial' | 'removed' | 'cleared' | 'error';
  slug?: string;
  done?: number;
  total?: number;
  count?: number;
  totalBytes?: number;
  manifestHash?: string;
  failedUrls?: string[];
  error?: string;
}

interface SwStatusMessage {
  type: 'status';
  slug: string;
  state: AppDownloadState;
  phase?: AppDownloadPhase;
  done: number;
  total: number;
  totalBytes?: number;
  manifestHash?: string;
}

interface SwSavedAppsMessage {
  type: 'saved-apps';
  slugs: string[];
  apps?: SavedOfflineApp[];
  error?: string;
}

type SwMessage = SwProgressMessage | SwDoneMessage | SwStatusMessage | SwSavedAppsMessage;

export interface SavedOfflineApp {
  slug: string;
  state: 'saved' | 'partial' | 'evicted' | 'downloading' | 'error';
  phase?: AppDownloadPhase;
  totalBytes?: number;
  manifestHash?: string;
  sealedAt?: string;
  updatedAt?: string;
  error?: string;
}

export interface OfflineHealth {
  state: OfflineHealthState;
  label: string;
  detail: string;
  actionable: boolean;
}

export function describeOfflineHealth(
  progress: AppDownloadProgress | SavedOfflineApp | undefined,
  opts: { cached?: boolean; online?: boolean } = {},
): OfflineHealth {
  const cached = Boolean(opts.cached);
  const online = opts.online ?? true;
  const state = progress?.state;
  const done = 'done' in (progress ?? {}) ? Number((progress as AppDownloadProgress).done ?? 0) : 0;
  const total = 'total' in (progress ?? {}) ? Number((progress as AppDownloadProgress).total ?? 0) : 0;
  const repairing = 'repairing' in (progress ?? {}) && Boolean((progress as AppDownloadProgress).repairing);

  if (repairing) {
    return {
      state: 'repairing',
      label: 'Repairing offline copy',
      detail: total > 0 ? `${done}/${total} files verified` : 'Re-sealing this tool.',
      actionable: false,
    };
  }

  if (state === 'requested' || state === 'downloading' || state === 'verifying') {
    return {
      state: 'saving',
      label: state === 'verifying' ? 'Verifying offline copy' : 'Saving for offline',
      detail: total > 0 ? `${done}/${total} files ready` : 'Preparing files.',
      actionable: false,
    };
  }

  if (state === 'saved' || cached) {
    return {
      state: 'ready',
      label: 'Ready offline',
      detail: formatOfflineBytes(progress?.totalBytes) || 'Cold-launchable on this device.',
      actionable: false,
    };
  }

  if (state === 'partial' || state === 'evicted') {
    return {
      state: online ? 'needs_refresh' : 'needs_connection',
      label: online ? 'Repair offline copy' : 'Needs connection',
      detail: online ? 'A saved file is missing. Shippie can re-seal it now.' : 'Reconnect once to re-seal this tool.',
      actionable: online,
    };
  }

  if (state === 'error') {
    return {
      state: online ? 'failed' : 'needs_connection',
      label: online ? 'Save failed' : 'Needs connection',
      detail: progress?.error || (online ? 'Try saving again.' : 'Reconnect and Shippie will retry.'),
      actionable: online,
    };
  }

  return {
    state: 'not_saved',
    label: 'Not saved',
    detail: 'Save this tool to cold-launch offline.',
    actionable: true,
  };
}

export function formatOfflineBytes(value: number | undefined): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let current = bytes / 1024;
  for (const unit of units) {
    if (current < 1024 || unit === 'GB') return `${current < 10 ? current.toFixed(1) : Math.round(current)} ${unit}`;
    current /= 1024;
  }
  return `${Math.round(current)} GB`;
}

export async function downloadApp(
  slug: string,
  onProgress?: (p: AppDownloadProgress) => void,
): Promise<AppDownloadProgress> {
  const sw = await getActiveSw({ ensureLatest: true });
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let last: AppDownloadProgress = { slug, state: 'downloading', done: 0, total: 0 };
    channel.port1.onmessage = (event) => {
      const msg = event.data as SwMessage;
      if (msg.type === 'progress') {
        last = {
          slug,
          state: msg.phase === 'verifying' ? 'verifying' : msg.phase === 'requested' ? 'requested' : 'downloading',
          phase: msg.phase ?? 'downloading',
          done: msg.done,
          total: msg.total,
        };
        onProgress?.(last);
        return;
      }
      if (msg.type !== 'done') return;
      channel.port1.close();
      if (msg.state === 'saved') {
        const p: AppDownloadProgress = {
          slug,
          state: 'saved',
          phase: 'sealed',
          done: msg.total ?? last.total,
          total: msg.total ?? last.total,
          totalBytes: msg.totalBytes,
          manifestHash: msg.manifestHash,
        };
        onProgress?.(p);
        resolve(p);
      } else if (msg.state === 'partial') {
        const p: AppDownloadProgress = {
          slug,
          state: 'partial',
          phase: 'partial',
          done: msg.done ?? last.done,
          total: msg.total ?? last.total,
          totalBytes: msg.totalBytes,
          manifestHash: msg.manifestHash,
          failedUrls: msg.failedUrls,
        };
        onProgress?.(p);
        resolve(p);
      } else {
        const err = new Error(msg.error ?? 'download_failed');
        const p: AppDownloadProgress = {
          slug,
          state: 'error',
          phase: 'error',
          done: last.done,
          total: last.total,
          error: err.message,
        };
        onProgress?.(p);
        reject(err);
      }
    };
    sw.postMessage({ type: 'DOWNLOAD_APP', slug }, [channel.port2]);
  });
}

export async function removeApp(slug: string): Promise<{ count: number }> {
  const sw = await getActiveSw();
  return withSwTimeout<{ count: number }>(
    (resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        const msg = event.data as SwDoneMessage;
        channel.port1.close();
        if (msg.type === 'done' && msg.state === 'removed') {
          resolve({ count: msg.count ?? 0 });
        } else {
          reject(new Error(msg.error ?? 'remove_failed'));
        }
      };
      sw.postMessage({ type: 'REMOVE_APP', slug }, [channel.port2]);
    },
    8000,
    'remove',
  );
}

export async function getAppStatus(slug: string): Promise<AppDownloadProgress> {
  const sw = await getActiveSw();
  return withSwTimeout<AppDownloadProgress>(
    (resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        const msg = event.data as SwStatusMessage;
        channel.port1.close();
        resolve({
          slug,
          state: msg.state ?? 'idle',
          phase: msg.phase ?? (msg.state === 'saved' ? 'sealed' : msg.state ?? 'idle'),
          done: msg.done ?? 0,
          total: msg.total ?? 0,
          totalBytes: msg.totalBytes,
          manifestHash: msg.manifestHash,
        });
      };
      sw.postMessage({ type: 'GET_APP_STATUS', slug }, [channel.port2]);
    },
    4000,
    'status',
  ).catch((): AppDownloadProgress => ({ slug, state: 'idle', done: 0, total: 0 }));
}

export async function listSavedApps(): Promise<string[]> {
  const details = await listSavedAppDetails();
  return details.filter((app) => app.state === 'saved').map((app) => app.slug);
}

export async function listSavedAppDetails(): Promise<SavedOfflineApp[]> {
  const sw = await getActiveSw();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      resolve([]);
    }, 4000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      channel.port1.close();
      const msg = event.data as SwSavedAppsMessage;
      if (Array.isArray(msg.apps)) {
        resolve(msg.apps);
        return;
      }
      resolve(Array.isArray(msg.slugs) ? msg.slugs.map((slug) => ({ slug, state: 'saved' })) : []);
    };
    sw.postMessage({ type: 'LIST_SAVED_APPS' }, [channel.port2]);
  });
}

export async function clearOfflineApps(): Promise<{ count: number }> {
  const sw = await getActiveSw();
  return withSwTimeout<{ count: number }>(
    (resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        const msg = event.data as SwDoneMessage;
        channel.port1.close();
        if (msg.type === 'done' && msg.state === 'cleared') {
          resolve({ count: msg.count ?? 0 });
        } else {
          reject(new Error(msg.error ?? 'clear_failed'));
        }
      };
      sw.postMessage({ type: 'CLEAR_OFFLINE' }, [channel.port2]);
    },
    12000,
    'clear',
  );
}

export async function requestPersistentOfflineStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getOfflineStorageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, persisted: false };
  }
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate().catch(() => ({ usage: 0, quota: 0 })),
    navigator.storage.persisted?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted,
  };
}
