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
 * If no SW is active yet (page just loaded, controller is null), every
 * function throws with NO_SW_ERROR. Callers should treat that as
 * "reload Shippie online once" — there's no useful fallback.
 */

export type AppDownloadState = 'idle' | 'downloading' | 'partial' | 'saved' | 'error';

export interface AppDownloadProgress {
  slug: string;
  state: AppDownloadState;
  done: number;
  total: number;
  failedUrls?: string[];
  error?: string;
}

const NO_SW_ERROR =
  'Service worker is not active yet. Reload Shippie online once and try again.';

function getActiveSw(): ServiceWorker {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    throw new Error(NO_SW_ERROR);
  }
  const sw = navigator.serviceWorker.controller;
  if (!sw) throw new Error(NO_SW_ERROR);
  return sw;
}

interface SwProgressMessage {
  type: 'progress';
  slug: string;
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
  failedUrls?: string[];
  error?: string;
}

interface SwStatusMessage {
  type: 'status';
  slug: string;
  state: AppDownloadState;
  done: number;
  total: number;
}

type SwMessage = SwProgressMessage | SwDoneMessage | SwStatusMessage;

export async function downloadApp(
  slug: string,
  onProgress?: (p: AppDownloadProgress) => void,
): Promise<AppDownloadProgress> {
  const sw = getActiveSw();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let last: AppDownloadProgress = { slug, state: 'downloading', done: 0, total: 0 };
    channel.port1.onmessage = (event) => {
      const msg = event.data as SwMessage;
      if (msg.type === 'progress') {
        last = { slug, state: 'downloading', done: msg.done, total: msg.total };
        onProgress?.(last);
        return;
      }
      if (msg.type !== 'done') return;
      channel.port1.close();
      if (msg.state === 'saved') {
        const p: AppDownloadProgress = {
          slug,
          state: 'saved',
          done: msg.total ?? last.total,
          total: msg.total ?? last.total,
        };
        onProgress?.(p);
        resolve(p);
      } else if (msg.state === 'partial') {
        const p: AppDownloadProgress = {
          slug,
          state: 'partial',
          done: msg.done ?? last.done,
          total: msg.total ?? last.total,
          failedUrls: msg.failedUrls,
        };
        onProgress?.(p);
        resolve(p);
      } else {
        const err = new Error(msg.error ?? 'download_failed');
        const p: AppDownloadProgress = {
          slug,
          state: 'error',
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
  const sw = getActiveSw();
  return new Promise((resolve, reject) => {
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
  });
}

export async function getAppStatus(slug: string): Promise<AppDownloadProgress> {
  const sw = getActiveSw();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const msg = event.data as SwStatusMessage;
      channel.port1.close();
      resolve({
        slug,
        state: msg.state ?? 'idle',
        done: msg.done ?? 0,
        total: msg.total ?? 0,
      });
    };
    sw.postMessage({ type: 'GET_APP_STATUS', slug }, [channel.port2]);
  });
}

export async function clearOfflineApps(): Promise<{ count: number }> {
  const sw = getActiveSw();
  return new Promise((resolve, reject) => {
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
  });
}
