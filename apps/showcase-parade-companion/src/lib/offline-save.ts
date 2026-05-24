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

export async function saveParadeOffline(slug = 'parade-companion'): Promise<OfflineSaveResult> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return NO_SW_RESULT;

  try {
    const registration = await navigator.serviceWorker.ready;
    try {
      await registration.update();
    } catch {
      // A stale active worker can still warm the current offline bundle.
    }

    const worker = navigator.serviceWorker.controller ?? registration.active;
    if (!worker) return NO_SW_RESULT;

    return await new Promise<OfflineSaveResult>((resolve) => {
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
  } catch (error) {
    return {
      state: 'error',
      done: 0,
      total: 0,
      error: error instanceof Error ? error.message : 'offline_save_failed',
    };
  }
}
