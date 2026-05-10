/**
 * Stockfish.wasm UCI driver.
 *
 * Loads the bundled `public/stockfish/stockfish.js` as a Web Worker.
 * The Stockfish JS detects the `worker` flag in its location hash and
 * boots the WASM engine internally; we drive it over UCI.
 *
 * Public surface:
 *   - createStockfish(): returns a driver, or null if the browser
 *     can't host a WASM worker (very old WebViews, no `Worker`).
 *   - driver.pickMove(fen, skill, movetimeMs): resolves with the
 *     UCI bestmove string (e.g. "e2e4", "e7e8q") or null on error.
 *   - driver.dispose(): terminate the worker.
 *
 * Skill mapping: caller passes UI skill 0..6; we scale to UCI Skill
 * Level 0..20 (Stockfish's range). Skill 0 is intentionally weak.
 */

const WORKER_URL = '/stockfish/stockfish.js#stockfish.wasm,worker';

export interface StockfishDriver {
  /** Block until Stockfish has finished UCI handshake. */
  ready(): Promise<void>;
  /** Resolve with the engine's bestmove (UCI string) for `fen`. */
  pickMove(fen: string, uiSkill: number, movetimeMs: number): Promise<string | null>;
  /** Terminate the worker. */
  dispose(): void;
}

/**
 * Returns a driver only if the runtime can actually host the worker
 * (HTTPS / same-origin / WASM available). Catch the null return and
 * fall back to the local minimax bot.
 */
export function createStockfish(): StockfishDriver | null {
  if (typeof Worker === 'undefined') return null;
  if (typeof WebAssembly === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(WORKER_URL);
  } catch {
    return null;
  }

  const listeners = new Set<(line: string) => void>();
  worker.onmessage = (e: MessageEvent<string>) => {
    const data = typeof e.data === 'string' ? e.data : '';
    for (const fn of listeners) fn(data);
  };
  worker.onerror = () => {
    for (const fn of listeners) fn('__error__');
  };

  function send(cmd: string) {
    worker.postMessage(cmd);
  }

  /**
   * Wait for the next line matching `predicate`. Resolves with that
   * line. Times out after `timeoutMs` to prevent stuck handshakes.
   */
  function waitFor(predicate: (line: string) => boolean, timeoutMs = 8000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        listeners.delete(handler);
        reject(new Error('stockfish: timeout'));
      }, timeoutMs);
      const handler = (line: string) => {
        if (line === '__error__') {
          listeners.delete(handler);
          window.clearTimeout(timer);
          reject(new Error('stockfish: worker error'));
          return;
        }
        if (predicate(line)) {
          listeners.delete(handler);
          window.clearTimeout(timer);
          resolve(line);
        }
      };
      listeners.add(handler);
    });
  }

  const readyPromise = (async () => {
    send('uci');
    await waitFor((l) => l === 'uciok', 12000);
    send('isready');
    await waitFor((l) => l === 'readyok', 8000);
  })();

  return {
    ready() {
      return readyPromise;
    },

    async pickMove(fen, uiSkill, movetimeMs) {
      try {
        await readyPromise;
        // 0..6 → 0..20. Round half up.
        const stockfishSkill = Math.max(0, Math.min(20, Math.round((uiSkill / 6) * 20)));
        send(`setoption name Skill Level value ${stockfishSkill}`);
        send(`position fen ${fen}`);
        send(`go movetime ${movetimeMs}`);
        const line = await waitFor((l) => l.startsWith('bestmove'), Math.max(2000, movetimeMs + 4000));
        const parts = line.split(/\s+/);
        const move = parts[1];
        if (!move || move === '(none)') return null;
        return move;
      } catch {
        return null;
      }
    },

    dispose() {
      try { worker.terminate(); } catch {/**/}
      listeners.clear();
    },
  };
}
