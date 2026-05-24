/**
 * @shippie/iframe-sdk — tiny client-side helper for showcase apps
 * loaded inside the Shippie container.
 *
 * Why it exists: every showcase was hand-rolling postMessage shapes
 * for `intent.provide`, `intent.consume`, `feel.texture`, and
 * `data.openPanel`. Five different copies of the same wire format is
 * five places to forget a field. This SDK collapses that surface to
 * four narrow calls makers actually use:
 *
 *   shippie.intent.broadcast(intent, rows)        ← provider push
 *   shippie.intent.subscribe(intent, handler)     ← consumer listen
 *   shippie.feel.texture(name)                    ← sensory layer
 *   shippie.data.openPanel()                      ← Your Data overlay
 *
 * Plus `shippie.requestIntent(intent)` to trigger the container's
 * one-time permission prompt for a consumer's declared intents on app
 * mount.
 *
 * Outside the container (when `window.parent === window`) every call
 * is a no-op — the SDK never throws, so showcases keep working
 * standalone for dev.
 */

const PROTOCOL = 'shippie.bridge.v1' as const;
const DEFAULT_RPC_TIMEOUT_MS = 5_000;
const LIFECYCLE_EVENT = 'shippie:app-lifecycle' as const;
const LIFECYCLE_VERSION = 1 as const;
const VIEW_TRANSITION_ERROR_RE = /view transition|transition/i;
const RECOVERABLE_TRANSITION_ERROR_RE = /timed out|timeout|skipped|aborted|interrupted/i;

export type AiTask =
  | 'classify'
  | 'embed'
  | 'sentiment'
  | 'moderate'
  | 'vision'
  | 'summarise'
  | 'generate'
  | 'translate';

/**
 * Subset of {@link AiTask} that the on-device inference iframe can
 * actually serve today. Mirrors the registry in
 * `apps/shippie-ai/src/inference/models/registry.ts`. Consumers can
 * typecheck a `shippie.ai.capabilities()` result against this union
 * instead of hard-coding string assumptions.
 */
export type InferenceTask =
  | 'classify'
  | 'embed'
  | 'sentiment'
  | 'moderate'
  | 'vision';

/**
 * Streaming progress event emitted while a model is downloading before
 * its first inference. Mirrors the transformers.js `progress_callback`
 * shape, normalised so consumers don't need to know about the runtime.
 *
 * Treat any non-positive `total` as "indeterminate" and render a
 * spinner rather than a percentage.
 */
export interface AiProgressEvent {
  /** Bytes received so far, when known. */
  loaded: number;
  /** Total expected bytes, when known. `0` means indeterminate. */
  total: number;
  /**
   * Transformers.js stage string — `'initiate' | 'download' | 'progress'
   * | 'done' | 'ready'` etc. Consumers can switch on this to render
   * different copy ("Downloading…" vs "Warming up…").
   */
  status: string;
}

export interface AiRunRequest {
  task: AiTask;
  input: unknown;
  options?: Record<string, unknown>;
  /**
   * Per-request deadline in milliseconds. Defaults to 60_000 — generous
   * enough to swallow first-call model downloads on 4G. Drop it
   * aggressively (e.g. 3_000) when degradation is acceptable, e.g.
   * sentiment-on-every-keystroke where falling back to "unavailable"
   * is fine.
   */
  timeoutMs?: number;
  /**
   * Fires zero or more times while the model behind this task is being
   * downloaded for the first time. Subsequent runs of the same task
   * hit the Cache Storage hot path and emit nothing.
   *
   * Outside the container this is never invoked — only the iframe can
   * observe download progress.
   */
  onProgress?: (event: AiProgressEvent) => void;
}

export interface AiRunResult {
  task: AiTask;
  output: unknown;
  /**
   * Where the inference came from. `'unavailable'` means the local
   * worker can't serve this task (no transformers runtime, model load
   * failed, or device too constrained). Showcases MUST gate features
   * on `source !== 'unavailable'` and hide the UI when it isn't —
   * never render a broken AI feature.
   *
   * NOTE: this field's shape is preserved for the load-bearing
   * `source !== 'unavailable'` gate the flagship consumers
   * (journal/pantry-scanner/shopping-list) already rely on. For finer
   * lifecycle distinctions (e.g. "still downloading"), prefer
   * `state` below.
   */
  source: 'local' | 'edge' | 'unavailable';
  /**
   * Finer-grained lifecycle state. Use this when you want to
   * distinguish a transient first-run download from a permanent
   * "this device can't serve the task":
   *
   *   - `'ready'`        — inference completed and `output` is valid.
   *   - `'loading'`      — model still downloading; `output` is null.
   *                        Prefer rendering a download indicator
   *                        instead of hiding the feature.
   *   - `'unavailable'`  — the iframe can't run this task on this
   *                        device. Hide the feature.
   *
   * Older hosts may omit this field; treat the absence as `'ready'`
   * for `source === 'local' | 'edge'` and `'unavailable'` otherwise.
   */
  state?: 'loading' | 'ready' | 'unavailable';
  /** Backend the worker actually ran on, when `source === 'local'`. */
  backend?: 'webnn' | 'webgpu' | 'wasm';
}

/**
 * Where the game holds its primary input area. The host adjusts its
 * own chrome based on this so navigation gestures don't bleed into
 * gameplay touch zones.
 *
 *   - `'none'`   — default; container chrome behaves normally
 *   - `'bottom'` — game owns the bottom ~30% (touch-controls row etc.)
 *   - `'all'`    — game owns the entire viewport; host shrinks its
 *                  chrome buttons to a slim edge-only hit zone
 */
export type InputRegionOwns = 'none' | 'bottom' | 'all';

export interface HostInsets {
  /** CSS px the game should leave clear at each edge. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface AppsListEntry {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  labelKind: 'Local' | 'Connected' | 'Cloud';
  provides: readonly string[];
  consumes: readonly string[];
}

export interface TransferAcceptor {
  slug: string;
  name: string;
  kinds: readonly string[];
}

export interface TransferStartResult {
  kind: string;
  acceptors: TransferAcceptor[];
}

export interface TransferCommitResult {
  delivered: boolean;
  target: { slug: string; name: string } | null;
  reason?:
    | 'no_target'
    | 'kind_not_accepted'
    | 'permission_not_yet_granted'
    | 'permission_denied';
}

export interface IncomingTransferStart {
  /** The kind the source app announced. */
  kind: string;
  /** Free-form preview the source attached (label, thumb url, etc). */
  preview: unknown;
  /** Internal id of the source app. Use only for display de-dup; not stable. */
  sourceAppId: string;
}

export interface IncomingTransferCommit {
  kind: string;
  payload: unknown;
  sourceAppId: string;
}

export interface AgentInsight {
  id: string;
  strategy: string;
  urgency: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  target: { app: string; route?: string; query?: Record<string, unknown> };
  expiresAt?: number;
  generatedAt: number;
}

const BUILTIN_TEXTURES = [
  'confirm',
  'complete',
  'error',
  'navigate',
  'delete',
  'refresh',
  'install',
  'milestone',
  'toggle',
] as const;

export type TextureName = (typeof BUILTIN_TEXTURES)[number];

export interface ShippieIframeSdkOptions {
  /** Stable app id — must match the container's curated entry. */
  appId: string;
}

export interface OpenYourDataOptions {
  /**
   * Container/catalog slug to preserve when falling back to the platform
   * Your Data surface outside an iframe.
   */
  appSlug?: string;
}

export interface IntentBroadcast {
  intent: string;
  rows: ReadonlyArray<unknown>;
  providerAppId?: string;
}

export type IntentHandler = (broadcast: IntentBroadcast) => void;

export interface ShippieIframeSdk {
  intent: {
    broadcast(intent: string, rows: ReadonlyArray<unknown>): void;
    subscribe(intent: string, handler: IntentHandler): () => void;
  };
  feel: {
    texture(name: TextureName): void;
  };
  data: {
    openPanel(): void;
  };
  apps: {
    /**
     * Return apps installed in the same container that share at least
     * one intent with this app. Apps with no overlap are filtered out
     * by the container — `apps.list` is not a fingerprint of the
     * user's full app set.
     */
    list(): Promise<AppsListEntry[]>;
  };
  agent: {
    /**
     * Return insights from the local agent that are derived from
     * data this app can already see (own namespace + granted intents).
     * Cross-app correlations the caller never had access to are
     * filtered out by the container.
     */
    insights(): Promise<AgentInsight[]>;
  };
  ai: {
    /**
     * Run a local AI task through the container's worker. The task
     * routes via the AI Web Worker to whichever backend is fastest
     * (WebNN → WebGPU → WASM); models are cached at the container
     * origin so 5 apps share one download.
     *
     * The result carries `source: 'unavailable'` when the backend
     * can't run the task. Showcases MUST gate AI-dependent features
     * on `source !== 'unavailable'` and hide those features when it
     * isn't — never render broken inference UI. This is a load-bearing
     * invariant; the three flagship AI consumers (journal,
     * pantry-scanner, shopping-list) all rely on it.
     *
     * Pass `req.onProgress` to render a download bar on the first
     * inference of a cold task; pass `req.timeoutMs` to override the
     * default 60_000 ms deadline.
     */
    run(req: AiRunRequest): Promise<AiRunResult>;
    /**
     * Resolve once the container's AI subsystem has signalled that it
     * is ready to serve inference. Useful for showcases that want to
     * gate AI-dependent UI on readiness — e.g. show an "AI loading…"
     * placeholder until `await shippie.ai.ready()` returns.
     *
     * Readiness is advisory: never rejects, and resolves quickly on
     * older hosts that don't yet forward the ready ping (so consumers
     * don't hang). Pair with the `source !== 'unavailable'` gate on
     * each `ai.run` result for the actual capability check.
     */
    ready(): Promise<void>;
    /**
     * Ask the container which inference tasks it can serve on this
     * device today. Returns an empty list outside the container or
     * when the iframe doesn't respond within ~2.5s — consumers should
     * treat that as "AI not available" and fall back gracefully.
     *
     * Use this for upfront UI gating ("not supported on this device")
     * instead of silently hiding features. Pair with the per-call
     * `source !== 'unavailable'` gate on each `ai.run` result for the
     * authoritative run-time check.
     */
    capabilities(): Promise<{ availableTasks: InferenceTask[] }>;
    /**
     * Hint the container that an inference task is likely to be
     * needed soon, so it can warm the relevant model in the
     * background. The iframe schedules the download via
     * `requestIdleCallback` when available so it never competes with
     * foreground inference.
     *
     * Always resolves — never rejects, even outside the container or
     * when the underlying preload fails. Safe to call from any
     * lifecycle hook (mount, route change, etc).
     */
    preload(task: InferenceTask): Promise<void>;
  };
  transfer: {
    /**
     * Announce a drag of `kind` with a free-form preview. Container
     * forwards the preview to every iframe whose manifest declared
     * `acceptsTransfer.kinds` matching this kind, then returns the
     * eligible-acceptor list so the source can show a drop indicator.
     */
    start(kind: string, preview?: unknown): Promise<TransferStartResult>;
    /**
     * Commit the actual payload to a single chosen target. First commit
     * from this source→target pair triggers a one-time user prompt.
     */
    commit(input: {
      kind: string;
      targetSlug: string;
      payload: unknown;
    }): Promise<TransferCommitResult>;
    /**
     * Subscribe to incoming `transferDrop.starting` broadcasts.
     * Destination iframes call this to light up drop overlays.
     */
    onIncomingStart(handler: (event: IncomingTransferStart) => void): () => void;
    /**
     * Subscribe to delivered `transferDrop.commit` payloads. Fires
     * after the user has granted the source→target pair.
     */
    onIncomingCommit(handler: (event: IncomingTransferCommit) => void): () => void;
  };
  lifecycle: {
    ready(): void;
    error(error: unknown): void;
    navigation(input?: { canGoBack?: boolean; navDepth?: number }): void;
    heartbeat(): void;
  };
  safeEdges: {
    /**
     * Tell the host which part of the viewport this app's touch
     * input occupies. The host uses this to size down its own chrome
     * (drawer pills, edge grabbers) so a tap meant for the game
     * doesn't accidentally open container UI.
     *
     * Safe to call repeatedly — only the latest value is honoured.
     * Calls outside the container are no-ops.
     */
    declareInputRegion(owns: InputRegionOwns): void;
    /**
     * Subscribe to host-side gesture-geometry changes. The host emits
     * `shippie:host-insets` whenever its chrome moves (orientation
     * rotate, drawer state change, canGoBack toggle). Returns an
     * unsubscribe function. Outside the container this is a no-op.
     */
    onHostInsets(handler: (insets: HostInsets) => void): () => void;
  };
  /**
   * Open the best available Your Data surface:
   *   1. container bridge overlay when iframe-loaded,
   *   2. wrapper Shadow DOM panel on maker subdomains,
   *   3. platform container data section for first-party /run apps.
   */
  openYourData(options?: OpenYourDataOptions): void;
  /** Trigger the container's permission prompt for an intent the app declares. */
  requestIntent(intent: string): void;
  /** True only when running inside an iframe whose parent isn't the same window. */
  readonly inContainer: boolean;
}

export function createShippieIframeSdk(opts: ShippieIframeSdkOptions): ShippieIframeSdk {
  const { appId } = opts;
  const w = typeof window === 'undefined' ? null : window;
  const inContainer = Boolean(w && w.parent && w.parent !== w);
  installLifecycleReporter();

  // RPC correlation table — request id → resolver. The container's
  // ContainerBridgeHost responds with `{ protocol, id, ok, result|error }`
  // on the same id we send. We listen on `message` and dispatch.
  const pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  // Streaming progress callbacks for in-flight `ai.run` requests, keyed
  // by the same id used in `pending`. The iframe posts `ai.progress`
  // envelopes mid-download; we fan out to the consumer's `onProgress`
  // hook and leave the RPC `pending` entry untouched until completion.
  const progressCallbacks = new Map<string, (event: AiProgressEvent) => void>();
  let rpcListenerInstalled = false;

  function ensureRpcListener(): void {
    if (rpcListenerInstalled || !w) return;
    rpcListenerInstalled = true;
    w.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as
        | {
            protocol?: string;
            id?: string;
            ok?: boolean;
            result?: unknown;
            error?: { message: string };
            kind?: string;
            loaded?: unknown;
            total?: unknown;
            status?: unknown;
          }
        | null;
      if (!data || data.protocol !== PROTOCOL) return;
      // Streaming progress event for an in-flight `ai.run`. Same id as
      // the original RPC; multiple events per id are expected.
      if (data.kind === 'ai.progress' && typeof data.id === 'string') {
        const cb = progressCallbacks.get(data.id);
        if (!cb) return;
        try {
          cb({
            loaded: typeof data.loaded === 'number' ? data.loaded : 0,
            total: typeof data.total === 'number' ? data.total : 0,
            status: typeof data.status === 'string' ? data.status : 'progress',
          });
        } catch {
          /* progress callbacks must never break the RPC */
        }
        return;
      }
      if (typeof data.id !== 'string' || typeof data.ok !== 'boolean') return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      progressCallbacks.delete(data.id);
      clearTimeout(entry.timer);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error?.message ?? 'bridge error'));
    });
  }

  function nextId(capability: string): string {
    return `${appId}_${capability}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  function send(capability: string, method: string, payload: Record<string, unknown>): void {
    if (!inContainer || !w) return;
    w.parent.postMessage(
      { protocol: PROTOCOL, id: nextId(capability), appId, capability, method, payload },
      '*',
    );
  }

  function postLifecycle(
    event: 'booting' | 'ready' | 'error' | 'navigation' | 'heartbeat',
    extra: { error?: unknown; canGoBack?: boolean; navDepth?: number } = {},
  ): void {
    if (!inContainer || !w) return;
    try {
      w.parent.postMessage(
        {
          type: LIFECYCLE_EVENT,
          version: LIFECYCLE_VERSION,
          event,
          source: 'iframe-sdk',
          appId,
          at: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(),
          href: typeof location !== 'undefined' ? location.href : undefined,
          path: typeof location !== 'undefined' ? `${location.pathname}${location.search}${location.hash}` : undefined,
          title: typeof document !== 'undefined' ? document.title : undefined,
          canGoBack: extra.canGoBack,
          navDepth: extra.navDepth,
          timing: collectLifecycleTiming(),
          error: extra.error === undefined ? undefined : normalizeLifecycleError(extra.error),
        },
        '*',
      );
    } catch {
      /* parent may be unavailable */
    }
  }

  function installLifecycleReporter(): void {
    if (!inContainer || !w || typeof document === 'undefined') return;
    const key = `__shippie_iframe_lifecycle_${appId}`;
    const flags = w as unknown as Record<string, unknown>;
    if (flags[key]) return;
    flags[key] = true;
    postLifecycle('booting');
    const ready = () => {
      void waitForPaintableDom(2_000).then(() => postLifecycle('ready'));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
    w.addEventListener('error', (event) => {
      const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
      if (target && ('src' in target || 'href' in target)) {
        const url = 'src' in target ? target.src : target.href;
        postLifecycle('error', { error: new Error(`asset failed to load: ${url}`) });
        return;
      }
      if (isRecoverableViewTransitionError(event.error ?? event.message)) return;
      postLifecycle('error', { error: event.error ?? event.message });
    }, true);
    w.addEventListener('unhandledrejection', (event) => {
      if (isRecoverableViewTransitionError(event.reason)) return;
      postLifecycle('error', { error: event.reason });
    });
  }

  function openYourData(options: OpenYourDataOptions = {}): void {
    if (!w) return;
    if (inContainer) {
      send('data.openPanel', 'open', {});
      return;
    }

    const root = (w as unknown as { shippie?: { openYourData?: (options?: OpenYourDataOptions) => void } }).shippie;
    if (typeof root?.openYourData === 'function') {
      root.openYourData(options);
      return;
    }

    const platformOrigin =
      w.location.hostname === 'localhost' || w.location.hostname === '127.0.0.1'
        ? `${w.location.protocol}//${w.location.hostname}:4101`
        : w.location.origin;
    const target = new URL('/container', platformOrigin);
    target.searchParams.set('section', 'data');
    if (options.appSlug) target.searchParams.set('app', options.appSlug);
    w.location.assign(
      target.origin === w.location.origin ? `${target.pathname}${target.search}` : target.href,
    );
  }

  /**
   * Request/response over the bridge. Resolves with `result`, rejects
   * with the bridge error or a timeout. Outside the container, returns
   * a fallback value so showcases keep working standalone.
   */
  function call<T>(
    capability: string,
    method: string,
    payload: Record<string, unknown>,
    fallback: T,
    timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  ): Promise<T> {
    if (!inContainer || !w) return Promise.resolve(fallback);
    ensureRpcListener();
    return new Promise<T>((resolve, reject) => {
      const id = nextId(capability);
      const timer = setTimeout(() => {
        pending.delete(id);
        progressCallbacks.delete(id);
        reject(new Error(`${capability} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      w.parent.postMessage(
        { protocol: PROTOCOL, id, appId, capability, method, payload },
        '*',
      );
    });
  }

  /**
   * RPC variant that registers a progress callback against the same
   * id as the request. The iframe streams `{ kind: 'ai.progress', id,
   * loaded, total, status }` envelopes mid-flight; the receiver in
   * {@link ensureRpcListener} fans them out to `onProgress`.
   */
  function callWithProgress<T>(
    capability: string,
    method: string,
    payload: Record<string, unknown>,
    fallback: T,
    timeoutMs: number,
    onProgress?: (event: AiProgressEvent) => void,
  ): Promise<T> {
    if (!inContainer || !w) return Promise.resolve(fallback);
    ensureRpcListener();
    return new Promise<T>((resolve, reject) => {
      const id = nextId(capability);
      const timer = setTimeout(() => {
        pending.delete(id);
        progressCallbacks.delete(id);
        reject(new Error(`${capability} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      if (onProgress) progressCallbacks.set(id, onProgress);
      w.parent.postMessage(
        { protocol: PROTOCOL, id, appId, capability, method, payload },
        '*',
      );
    });
  }

  const handlers = new Map<string, Set<IntentHandler>>();
  let listenerInstalled = false;

  function ensureListener(): void {
    if (listenerInstalled || !w) return;
    listenerInstalled = true;
    w.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as
        | { kind?: string; intent?: string; rows?: unknown; providerAppId?: string }
        | null;
      if (!data || data.kind !== 'shippie.intent.broadcast') return;
      if (typeof data.intent !== 'string') return;
      const set = handlers.get(data.intent);
      if (!set || set.size === 0) return;
      const broadcast: IntentBroadcast = {
        intent: data.intent,
        rows: Array.isArray(data.rows) ? (data.rows as unknown[]) : [],
      };
      if (typeof data.providerAppId === 'string') broadcast.providerAppId = data.providerAppId;
      for (const h of set) h(broadcast);
    });
  }

  // Transfer-drop wire format. Two channels: `shippie.transfer.starting`
  // (preview broadcasts) and `shippie.transfer.commit` (delivered
  // payloads). Each carries `transferKind`, `sourceAppId`, and either
  // a `preview` or a `payload`.
  const incomingStartHandlers = new Set<(event: IncomingTransferStart) => void>();
  const incomingCommitHandlers = new Set<(event: IncomingTransferCommit) => void>();
  let transferListenerInstalled = false;

  // Safe-edges inbound channel: host posts `shippie:host-insets` with
  // the current `{ left, right, top, bottom }` gesture geometry. Games
  // subscribe via `safeEdges.onHostInsets`.
  const hostInsetsHandlers = new Set<(insets: HostInsets) => void>();
  let hostInsetsListenerInstalled = false;

  function ensureHostInsetsListener(): void {
    if (hostInsetsListenerInstalled || !w) return;
    hostInsetsListenerInstalled = true;
    w.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; insets?: { left?: unknown; right?: unknown; top?: unknown; bottom?: unknown } }
        | null;
      if (!data || data.type !== 'shippie:host-insets') return;
      const raw = data.insets;
      if (!raw || typeof raw !== 'object') return;
      const insets: HostInsets = {
        left: numberOrZero(raw.left),
        right: numberOrZero(raw.right),
        top: numberOrZero(raw.top),
        bottom: numberOrZero(raw.bottom),
      };
      for (const h of hostInsetsHandlers) h(insets);
    });
  }

  function ensureTransferListener(): void {
    if (transferListenerInstalled || !w) return;
    transferListenerInstalled = true;
    w.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as
        | {
            kind?: string;
            transferKind?: string;
            preview?: unknown;
            payload?: unknown;
            sourceAppId?: string;
          }
        | null;
      if (!data || typeof data.transferKind !== 'string') return;
      if (typeof data.sourceAppId !== 'string') return;
      if (data.kind === 'shippie.transfer.starting') {
        const evt: IncomingTransferStart = {
          kind: data.transferKind,
          preview: data.preview,
          sourceAppId: data.sourceAppId,
        };
        for (const h of incomingStartHandlers) h(evt);
      } else if (data.kind === 'shippie.transfer.commit') {
        const evt: IncomingTransferCommit = {
          kind: data.transferKind,
          payload: data.payload,
          sourceAppId: data.sourceAppId,
        };
        for (const h of incomingCommitHandlers) h(evt);
      }
    });
  }

  return {
    intent: {
      broadcast(intent, rows) {
        send('intent.provide', 'broadcast', { intent, rows });
      },
      subscribe(intent, handler) {
        ensureListener();
        let set = handlers.get(intent);
        if (!set) {
          set = new Set();
          handlers.set(intent, set);
        }
        set.add(handler);
        return () => {
          set!.delete(handler);
          if (set!.size === 0) handlers.delete(intent);
        };
      },
    },
    feel: {
      texture(name) {
        if (!isTextureName(name)) return;
        send('feel.texture', 'fire', { name });
      },
    },
    data: {
      openPanel() {
        send('data.openPanel', 'open', {});
      },
    },
    apps: {
      async list() {
        const result = await call<{ apps?: AppsListEntry[] }>(
          'apps.list',
          'list',
          {},
          { apps: [] },
        );
        return result.apps ?? [];
      },
    },
    agent: {
      async insights() {
        const result = await call<{ insights?: AgentInsight[] }>(
          'agent.insights',
          'list',
          {},
          { insights: [] },
        );
        return result.insights ?? [];
      },
    },
    ai: {
      async run(req) {
        // Default to 60s — generous enough to swallow cold-start model
        // downloads on 4G; consumers can shorten it via `req.timeoutMs`
        // when degradation is acceptable (e.g. sentiment-per-keystroke).
        const timeoutMs = typeof req.timeoutMs === 'number' && req.timeoutMs > 0
          ? req.timeoutMs
          : 60_000;
        const fallback: AiRunResult = {
          task: req.task,
          output: null,
          source: 'unavailable',
          state: 'unavailable',
        };
        try {
          const raw = await callWithProgress<AiRunResult>(
            'ai.run',
            'run',
            { task: req.task, input: req.input, options: req.options },
            fallback,
            timeoutMs,
            req.onProgress,
          );
          // Back-compat: older hosts won't stamp `state`, so derive it
          // from `source` so consumers can rely on the new field even
          // when talking to an older iframe.
          if (raw && typeof raw === 'object' && raw.state === undefined) {
            return {
              ...raw,
              state: raw.source === 'unavailable' ? 'unavailable' : 'ready',
            };
          }
          return raw;
        } catch {
          return fallback;
        }
      },
      async ready() {
        // Probe the container for AI readiness. Falls back to a
        // resolved no-op against older hosts that don't implement the
        // `ai.ready` bridge method (the `call` helper resolves to the
        // supplied fallback on timeout, so we never throw). Outside
        // the container, `call` short-circuits to the fallback too.
        try {
          await call<Record<string, unknown>>('ai.ready', 'ready', {}, {}, 2_500);
        } catch {
          // Readiness is advisory — never reject.
        }
      },
      async capabilities() {
        // Probe the iframe for its task list. Outside the container,
        // and on older hosts that don't implement `ai.capabilities`,
        // resolve to an empty list — consumers can treat that as
        // "AI not available" and gate the UI accordingly.
        try {
          const result = await call<{ availableTasks?: InferenceTask[] }>(
            'ai.capabilities',
            'list',
            {},
            { availableTasks: [] },
            2_500,
          );
          return {
            availableTasks: Array.isArray(result.availableTasks)
              ? result.availableTasks
              : [],
          };
        } catch {
          return { availableTasks: [] };
        }
      },
      async preload(task) {
        // Fire-and-forget hint. Iframe schedules the download via
        // `requestIdleCallback` so it never competes with foreground
        // inference. Always resolves; preload failures are silent by
        // design — the next real `ai.run` will surface any error.
        if (!inContainer || !w) return;
        try {
          w.parent.postMessage(
            {
              protocol: PROTOCOL,
              id: nextId('ai.preload'),
              appId,
              capability: 'ai.preload',
              method: 'preload',
              payload: { task },
            },
            '*',
          );
        } catch {
          /* preload never rejects */
        }
      },
    },
    transfer: {
      async start(kind, preview) {
        return call<TransferStartResult>(
          'data.transferDrop',
          'starting',
          { kind, preview },
          { kind, acceptors: [] },
        );
      },
      async commit({ kind, targetSlug, payload }) {
        return call<TransferCommitResult>(
          'data.transferDrop',
          'commit',
          { kind, targetSlug, payload },
          { delivered: false, target: null, reason: 'no_target' },
        );
      },
      onIncomingStart(handler) {
        ensureTransferListener();
        incomingStartHandlers.add(handler);
        return () => {
          incomingStartHandlers.delete(handler);
        };
      },
      onIncomingCommit(handler) {
        ensureTransferListener();
        incomingCommitHandlers.add(handler);
        return () => {
          incomingCommitHandlers.delete(handler);
        };
      },
    },
    lifecycle: {
      ready() {
        postLifecycle('ready');
      },
      error(error) {
        postLifecycle('error', { error });
      },
      navigation(input = {}) {
        postLifecycle('navigation', input);
      },
      heartbeat() {
        postLifecycle('heartbeat');
      },
    },
    safeEdges: {
      declareInputRegion(owns) {
        if (owns !== 'none' && owns !== 'bottom' && owns !== 'all') return;
        send('safe-edges', 'declareInputRegion', { owns });
      },
      onHostInsets(handler) {
        ensureHostInsetsListener();
        hostInsetsHandlers.add(handler);
        return () => {
          hostInsetsHandlers.delete(handler);
        };
      },
    },
    openYourData,
    requestIntent(intent) {
      send('intent.consume', 'consume', { intent });
    },
    inContainer,
  };
}

export function isTextureName(value: string): value is TextureName {
  return (BUILTIN_TEXTURES as readonly string[]).includes(value);
}

export function listBuiltinTextureNames(): readonly TextureName[] {
  return BUILTIN_TEXTURES;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function collectLifecycleTiming(): Record<string, number> | undefined {
  if (typeof performance === 'undefined') return undefined;
  const timing: Record<string, number> = {
    sinceNavigationStartMs: Math.round(
      typeof performance.now === 'function' ? performance.now() : Date.now(),
    ),
  };
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      if (nav.domContentLoadedEventEnd > 0) timing.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
      if (nav.loadEventEnd > 0) timing.loadMs = Math.round(nav.loadEventEnd);
    }
    for (const paint of performance.getEntriesByType?.('paint') ?? []) {
      if (paint.name === 'first-paint') timing.firstPaintMs = Math.round(paint.startTime);
      if (paint.name === 'first-contentful-paint') timing.firstContentfulPaintMs = Math.round(paint.startTime);
    }
  } catch {
    /* timing is advisory */
  }
  return timing;
}

function normalizeLifecycleError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    const normalized = { name: error.name, message: error.message || 'Unknown app error' };
    if (typeof error.stack === 'string') return { ...normalized, stack: error.stack };
    return normalized;
  }
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? 'Unknown app error') };
  }
  return { message: 'Unknown app error' };
}

function isRecoverableViewTransitionError(error: unknown): boolean {
  const record = error as { name?: unknown; message?: unknown } | null;
  const message = typeof record?.message === 'string' ? record.message : String(error ?? '');
  const name = typeof record?.name === 'string' ? record.name : '';
  const text = `${name} ${message}`;
  return VIEW_TRANSITION_ERROR_RE.test(text) && RECOVERABLE_TRANSITION_ERROR_RE.test(text);
}

function waitForPaintableDom(timeoutMs: number): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (domLooksPaintable()) return afterAnimationFrame();
  return new Promise((resolve) => {
    const finish = () => {
      observer?.disconnect();
      clearTimeout(timer);
      void afterAnimationFrame().then(resolve);
    };
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (domLooksPaintable()) finish();
          });
    observer?.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const timer = setTimeout(finish, timeoutMs);
    if (domLooksPaintable()) finish();
  });
}

function domLooksPaintable(): boolean {
  if (typeof document === 'undefined') return true;
  const body = document.body;
  if (!body) return false;
  const text = (body.innerText || body.textContent || '').trim();
  if (text.length > 0) return true;
  return Boolean(body.querySelector('canvas, svg, img, video, button, input, textarea, select, [role="button"], [role="main"], main, #root > *, #app > *'));
}

function afterAnimationFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
