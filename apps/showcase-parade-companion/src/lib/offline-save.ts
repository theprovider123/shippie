export type OfflineSaveState = 'saved' | 'partial' | 'unsupported' | 'error';

export interface OfflineSaveResult {
  state: OfflineSaveState;
  done: number;
  total: number;
  error?: string;
}

interface SwProgressMessage {
  type: 'progress';
  done: number;
  total: number;
}

interface SwDoneMessage {
  type: 'done';
  state: 'saved' | 'partial' | 'error';
  done?: number;
  total?: number;
  error?: string;
}

type SwMessage = SwProgressMessage | SwDoneMessage;

const NO_SW_RESULT: OfflineSaveResult = { state: 'unsupported', done: 0, total: 0 };
const DETAIL_PACK_CACHE = 'parade-companion:islington-detail:v1';
const DETAIL_PACK_ASSETS = [
  'basemap/corridor.webp',
  'route-pack.json',
  'fonts/fraunces-roman.woff2',
  'fonts/fraunces-italic.woff2',
  'fonts/jetbrains-mono.woff2',
  'fonts/general-sans-400.woff2',
  'fonts/general-sans-500.woff2',
  'fonts/general-sans-600.woff2',
  'fonts/general-sans-700.woff2',
];

export async function saveParadeOffline(slug = 'parade-companion'): Promise<OfflineSaveResult> {
  const detailPack = cacheIslingtonDetailPack();
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return (await detailPack) ?? NO_SW_RESULT;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    try {
      await registration.update();
    } catch {
      // A stale active worker can still warm the current offline bundle.
    }

    const worker = navigator.serviceWorker.controller ?? registration.active;
    if (!worker) return (await detailPack) ?? NO_SW_RESULT;

    const workerResult = await new Promise<OfflineSaveResult>((resolve) => {
      const channel = new MessageChannel();
      let last: OfflineSaveResult = { state: 'partial', done: 0, total: 0 };
      const timer = window.setTimeout(() => {
        channel.port1.close();
        resolve({ ...last, state: last.done > 0 ? 'partial' : 'error', error: 'timeout' });
      }, 20_000);

      channel.port1.onmessage = (event) => {
        const message = event.data as SwMessage;
        if (message.type === 'progress') {
          last = {
            state: 'partial',
            done: Math.max(0, Number(message.done) || 0),
            total: Math.max(0, Number(message.total) || 0),
          };
          return;
        }
        if (message.type !== 'done') return;
        window.clearTimeout(timer);
        channel.port1.close();
        if (message.state === 'saved' || message.state === 'partial') {
          resolve({
            state: message.state,
            done: Math.max(0, Number(message.done ?? message.total ?? last.done) || 0),
            total: Math.max(0, Number(message.total ?? last.total) || 0),
          });
          return;
        }
        resolve({
          ...last,
          state: 'error',
          error: typeof message.error === 'string' ? message.error : 'download_failed',
        });
      };

      worker.postMessage({ type: 'DOWNLOAD_APP', slug }, [channel.port2]);
    });
    const detailResult = await detailPack;
    if (workerResult.state === 'saved') return workerResult;
    if (detailResult?.state === 'saved') return detailResult;
    return workerResult;
  } catch (error) {
    const detailResult = await detailPack;
    if (detailResult?.state === 'saved') return detailResult;
    return {
      state: 'error',
      done: 0,
      total: 0,
      error: error instanceof Error ? error.message : 'offline_save_failed',
    };
  }
}

export async function cacheIslingtonDetailPack(): Promise<OfflineSaveResult | null> {
  if (typeof caches === 'undefined') return null;
  const urls = DETAIL_PACK_ASSETS.map((asset) => `${import.meta.env.BASE_URL}${asset}`);
  let done = 0;
  try {
    const cache = await caches.open(DETAIL_PACK_CACHE);
    await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`failed:${url}`);
        await cache.put(url, response);
        done += 1;
      }),
    );
    return { state: 'saved', done, total: urls.length };
  } catch (error) {
    return {
      state: done > 0 ? 'partial' : 'error',
      done,
      total: urls.length,
      error: error instanceof Error ? error.message : 'detail_pack_failed',
    };
  }
}
