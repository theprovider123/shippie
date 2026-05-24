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
 *
 *   5. Streams download progress mid-flight as `ai.progress` messages,
 *      handles capability probes (`ai.capabilities`), and accepts
 *      fire-and-forget preload hints (`ai.preload`) that schedule a
 *      low-priority background download via the Worker.
 */
import { logUsage } from '../dashboard/usage-log.ts';
import { SUPPORTED_TASKS } from './models/registry.ts';
import type {
  Backend,
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

/** Capability probe — embedder asks which tasks the iframe can serve today. */
export interface CapabilitiesRequest {
  type: 'ai.capabilities';
  requestId: string;
}

/** Capability probe reply. */
export interface CapabilitiesResponse {
  type: 'ai.capabilities';
  requestId: string;
  availableTasks: InferenceTask[];
}

/** Fire-and-forget preload hint — never acked. */
export interface PreloadRequest {
  type: 'ai.preload';
  task: InferenceTask;
}

/** Streaming download progress — same requestId as the original ai.run. */
export interface ProgressMessage {
  type: 'ai.progress';
  requestId: string;
  task: InferenceTask;
  loaded: number;
  total: number;
  status: string;
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
  /**
   * Subscribe to worker progress events. Production wires this to the
   * dedicated Worker's `message` listener filtered on `type ===
   * 'ai.progress'`; tests pass a fake.
   *
   * The router forwards each event to the original requester via
   * postMessage so the iframe-sdk can dispatch it to the consumer's
   * `onProgress` callback.
   */
  onWorkerProgress?(handler: (event: ProgressMessage) => void): void;
  /**
   * Schedule a preload for the given task. Production uses
   * `requestIdleCallback` to drop the warm-up to background priority
   * and posts an `ai.preload` message to the Worker; tests inject a fake.
   */
  schedulePreload?(task: InferenceTask): void;
}

interface PendingPostable {
  postMessage(data: unknown, targetOrigin: string): void;
}

export function createRouter(deps: RouterDeps): { stop(): void } {
  const now = deps.now ?? (() => Date.now());
  const log = deps.logUsage ?? logUsage;
  const listenOn = deps.listenOn ?? globalThis;

  // requestId → { source, origin } so worker progress events can be
  // routed back to the right embedder.
  const inflight = new Map<string, { source: PendingPostable; origin: string; task: InferenceTask }>();

  deps.onWorkerProgress?.((event) => {
    const target = inflight.get(event.requestId);
    if (!target) return;
    try {
      target.source.postMessage(event, target.origin);
    } catch {
      /* embedder may have unloaded; safe to ignore */
    }
  });

  const handler = async (e: MessageEvent) => {
    if (!isAllowedOrigin(e.origin)) return; // drop silently — defense in depth
    const data = e.data;
    const source = e.source as PendingPostable | null;
    if (!source) return;

    // Capability probe — no inference, just announce which tasks we serve.
    if (isCapabilitiesRequest(data)) {
      const reply: CapabilitiesResponse = {
        type: 'ai.capabilities',
        requestId: data.requestId,
        availableTasks: SUPPORTED_TASKS,
      };
      source.postMessage(reply, e.origin);
      return;
    }

    // Preload hint — fire-and-forget. Never acked, never logged.
    if (isPreloadRequest(data)) {
      deps.schedulePreload?.(data.task);
      return;
    }

    if (!isInferenceMessage(data)) return;

    inflight.set(data.requestId, { source, origin: e.origin, task: data.task });
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
        source: extractSource(result),
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
    } finally {
      inflight.delete(data.requestId);
    }
  };

  // Wrap handler to satisfy EventListener's `Event` parameter — at runtime
  // the message events match the MessageEvent shape.
  const wrapped: EventListener = (e) => {
    void handler(e as MessageEvent);
  };
  listenOn.addEventListener('message', wrapped);

  // Tell the embedder we're ready so it can flush queued requests.
  if (deps.postReady) deps.postReady();

  return {
    stop() {
      const remove = (listenOn as { removeEventListener?: typeof globalThis.removeEventListener })
        .removeEventListener;
      remove?.('message', wrapped);
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

function isCapabilitiesRequest(value: unknown): value is CapabilitiesRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.type === 'ai.capabilities' && typeof v.requestId === 'string';
}

function isPreloadRequest(value: unknown): value is PreloadRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type !== 'ai.preload') return false;
  if (typeof v.task !== 'string') return false;
  return SUPPORTED_TASKS.includes(v.task as InferenceTask);
}

/** Pull the `source` field off an inference result, if present. Defensive
 *  about result shape — tests dispatch a variety of payloads. */
function extractSource(result: unknown): Backend | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const s = (result as { source?: unknown }).source;
  return typeof s === 'string' ? (s as Backend) : undefined;
}

/**
 * Production bootstrap — boots the Worker, wires the router, signals ready.
 * `inference.html` imports this module side-effectfully.
 */
function boot() {
  if (typeof window === 'undefined') return;
  // Lazy-construct the dedicated Worker only once we're in the browser.
  let worker: Worker | null = null;
  const pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const progressHandlers = new Set<(event: ProgressMessage) => void>();

  // Circuit breaker: a Worker stuck mid-WASM-computation never fires
  // `error`, so the embedder hangs forever. If a request doesn't respond
  // within WORKER_DEADLOCK_MS, we assume the Worker is wedged, terminate
  // it, and reject all pending batches. The next request rebuilds.
  const WORKER_DEADLOCK_MS = 90_000;

  const tripBreaker = (reason: string): void => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as
        | InferenceResponse
        | ProgressMessage
        | undefined;
      if (!data || typeof data !== 'object') return;
      if ((data as ProgressMessage).type === 'ai.progress') {
        for (const h of progressHandlers) h(data as ProgressMessage);
        return;
      }
      const response = data as InferenceResponse;
      if (typeof response.requestId !== 'string') return;
      const p = pending.get(response.requestId);
      if (!p) return;
      pending.delete(response.requestId);
      clearTimeout(p.timer);
      if (response.error) p.reject(new Error(response.error));
      else p.resolve(response.result);
    });
    worker.addEventListener('error', () => {
      // If the worker dies, reject everything in flight so the embedder gets
      // a real error instead of hanging forever. The next request rebuilds.
      tripBreaker('worker crashed');
    });
    return worker;
  };

  const dispatch = (req: InferenceMessage): Promise<unknown> => {
    const w = ensureWorker();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Worker missed its deadline — treat as wedged. Tripping the
        // breaker also rejects any other pending batches sharing the
        // same Worker, so consumers see a real error instead of a hang.
        tripBreaker(`worker deadlock (no response in ${WORKER_DEADLOCK_MS}ms)`);
      }, WORKER_DEADLOCK_MS);
      pending.set(req.requestId, { resolve, reject, timer });
      w.postMessage(req);
    });
  };

  // Schedule a low-priority warm-up. `requestIdleCallback` is available on
  // Chrome/Firefox; Safari and the Worker scope fall back to setTimeout(0).
  const schedulePreload = (task: InferenceTask): void => {
    const w = ensureWorker();
    const fire = () => {
      try {
        w.postMessage({ type: 'ai.preload', task });
      } catch {
        /* worker may have been torn down; next request rebuilds */
      }
    };
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => unknown })
      .requestIdleCallback;
    if (typeof ric === 'function') ric(fire);
    else setTimeout(fire, 0);
  };

  createRouter({
    dispatch,
    onWorkerProgress: (h) => {
      progressHandlers.add(h);
    },
    schedulePreload,
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
