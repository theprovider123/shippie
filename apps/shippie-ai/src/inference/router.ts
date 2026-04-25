/**
 * The cross-origin postMessage router.
 *
 * Loaded by `inference.html` inside an iframe whose embedder is some other
 * `*.shippie.app` host (e.g. recipe.shippie.app). The router:
 *
 *   1. Validates the message origin against ALLOWED_ORIGIN_RE.
 *      Anything not matching `^https://[a-z0-9-]+\.shippie\.app$` is dropped.
 *      Adversarial inputs we explicitly block:
 *        - evil.com
 *        - shippie.app.evil.com
 *        - https://ai.shippie.app.evil.com
 *        - http://recipe.shippie.app  (no TLS)
 *
 *   2. Dispatches the request to a dedicated Worker. The Worker holds the
 *      transformers.js pipelines and runs inference off the main thread so
 *      the iframe survives iOS Safari memory pressure better.
 *
 *   3. Logs the inference (origin, task, ts, durationMs) to IndexedDB so
 *      the dashboard can show real per-app usage. The input text is NEVER
 *      logged. This is a load-bearing privacy invariant.
 *
 *   4. Posts the result back to e.source with targetOrigin === e.origin
 *      (never '*'), so a misconfigured embedder can't intercept replies.
 */
import { logUsage } from '../dashboard/usage-log.ts';
import { SUPPORTED_TASKS } from './models/registry.ts';
import type {
  InferenceMessage,
  InferenceResponse,
  InferenceTask,
  ReadyMessage,
} from '../types.ts';

/**
 * Strict allowlist regex — the security boundary.
 *
 * Anchored at both ends. The `.shippie.app$` suffix is the critical part:
 * `shippie.app.evil.com` is rejected because it doesn't end with
 * `.shippie.app`, and `ai.shippie.app.evil.com` is rejected for the same
 * reason. Subdomain label charset is intentionally tight — lowercase
 * alphanumerics + hyphen only. No multi-label subdomains are allowed; if we
 * ever need `foo.bar.shippie.app`, broaden deliberately.
 */
export const ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.shippie\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  if (typeof origin !== 'string' || origin.length === 0) return false;
  return ALLOWED_ORIGIN_RE.test(origin);
}

interface RouterDeps {
  /** Where to send work. In production this is a `new Worker(...)`; tests inject a fake. */
  dispatch(req: InferenceMessage): Promise<unknown>;
  /** Source of `now()` — overrideable for tests. */
  now?: () => number;
  /** postMessage entry point. Default uses globalThis.parent. */
  postReady?: () => void;
  /** Window to listen on. Default `globalThis`. */
  listenOn?: { addEventListener: typeof globalThis.addEventListener };
  /** Optional usage logger override (tests). */
  logUsage?: typeof logUsage;
}

interface PendingPostable {
  postMessage(data: InferenceResponse, targetOrigin: string): void;
}

export function createRouter(deps: RouterDeps): { stop(): void } {
  const now = deps.now ?? (() => Date.now());
  const log = deps.logUsage ?? logUsage;
  const listenOn = deps.listenOn ?? globalThis;

  const handler = async (e: MessageEvent) => {
    if (!isAllowedOrigin(e.origin)) return; // drop silently — defense in depth
    const data = e.data;
    if (!isInferenceMessage(data)) return;

    const source = e.source as PendingPostable | null;
    if (!source) return;

    const start = now();
    try {
      const result = await deps.dispatch({
        requestId: data.requestId,
        task: data.task,
        payload: data.payload,
      });
      const durationMs = now() - start;
      // Fire-and-forget usage log; logging failure must never break inference.
      void log({
        origin: e.origin,
        task: data.task,
        ts: now(),
        durationMs,
      }).catch(() => {});
      source.postMessage(
        { requestId: data.requestId, result } satisfies InferenceResponse,
        e.origin,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      source.postMessage(
        { requestId: data.requestId, error: message } satisfies InferenceResponse,
        e.origin,
      );
    }
  };

  listenOn.addEventListener('message', handler as EventListener);

  // Tell the embedder we're ready so it can flush queued requests.
  if (deps.postReady) deps.postReady();

  return {
    stop() {
      // happy-dom and DOM both expose removeEventListener on globalThis.
      (listenOn as unknown as Window).removeEventListener?.(
        'message',
        handler as EventListener,
      );
    },
  };
}

function isInferenceMessage(value: unknown): value is InferenceMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== 'string' || v.requestId.length === 0) return false;
  if (typeof v.task !== 'string') return false;
  if (!SUPPORTED_TASKS.includes(v.task as InferenceTask)) return false;
  if (v.payload && typeof v.payload !== 'object') return false;
  return true;
}

/**
 * Production bootstrap — boots the Worker, wires the router, signals ready.
 * `inference.html` imports this module side-effectfully.
 */
function boot() {
  if (typeof window === 'undefined') return;
  // Lazy-construct the dedicated Worker only once we're in the browser.
  let worker: Worker | null = null;
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as InferenceResponse | undefined;
      if (!data || typeof data.requestId !== 'string') return;
      const p = pending.get(data.requestId);
      if (!p) return;
      pending.delete(data.requestId);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    });
    worker.addEventListener('error', () => {
      // If the worker dies, reject everything in flight so the embedder gets
      // a real error instead of hanging forever. The next request rebuilds.
      for (const p of pending.values()) p.reject(new Error('worker crashed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  };

  const dispatch = (req: InferenceMessage): Promise<unknown> => {
    const w = ensureWorker();
    return new Promise<unknown>((resolve, reject) => {
      pending.set(req.requestId, { resolve, reject });
      w.postMessage(req);
    });
  };

  createRouter({
    dispatch,
    postReady: () => {
      const ready: ReadyMessage = { type: 'ready', tasks: SUPPORTED_TASKS };
      // Embedder origin is unknown at boot — the only safe targetOrigin is
      // '*' for the ready ping, because there's no payload here that
      // matters. The embedder verifies e.origin === 'https://ai.shippie.app'
      // on its end before treating us as live.
      window.parent?.postMessage(ready, '*');
    },
  });
}

// Side-effect boot when loaded inside inference.html. Tests import the
// module via `createRouter` directly and never run the boot path.
if (typeof window !== 'undefined' && !(globalThis as unknown as { __SHIPPIE_AI_TEST__?: boolean }).__SHIPPIE_AI_TEST__) {
  boot();
}
