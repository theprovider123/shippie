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

export type AiTask =
  | 'classify'
  | 'embed'
  | 'sentiment'
  | 'moderate'
  | 'vision'
  | 'summarise'
  | 'generate'
  | 'translate';

export interface AiRunRequest {
  task: AiTask;
  input: unknown;
  options?: Record<string, unknown>;
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
   */
  source: 'local' | 'edge' | 'unavailable';
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
     * can't run the task. Showcases MUST gate features on this and
     * hide the UI when unavailable — never render broken AI.
     */
    run(req: AiRunRequest): Promise<AiRunResult>;
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
  let rpcListenerInstalled = false;

  function ensureRpcListener(): void {
    if (rpcListenerInstalled || !w) return;
    rpcListenerInstalled = true;
    w.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as
        | { protocol?: string; id?: string; ok?: boolean; result?: unknown; error?: { message: string } }
        | null;
      if (!data || data.protocol !== PROTOCOL) return;
      if (typeof data.id !== 'string' || typeof data.ok !== 'boolean') return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
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
      postLifecycle('error', { error: event.error ?? event.message });
    }, true);
    w.addEventListener('unhandledrejection', (event) => {
      postLifecycle('error', { error: event.reason });
    });
  }

  function openYourData(options: OpenYourDataOptions = {}): void {
    if (!w) return;
    if (inContainer) {
      send('data.openPanel', 'open', {});
      return;
    }

    const root = (w as unknown as { shippie?: { openYourData?: () => void } }).shippie;
    if (typeof root?.openYourData === 'function') {
      root.openYourData();
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
        providerAppId: typeof data.providerAppId === 'string' ? data.providerAppId : undefined,
      };
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
        // Bigger timeout — model downloads can run 10s+ on a cold
        // first invocation. After the first call the backend cache
        // makes subsequent calls instant.
        return call<AiRunResult>(
          'ai.run',
          'run',
          { task: req.task, input: req.input, options: req.options },
          { task: req.task, output: null, source: 'unavailable' },
          60_000,
        );
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
    return { name: error.name, message: error.message || 'Unknown app error', stack: error.stack };
  }
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? 'Unknown app error') };
  }
  return { message: 'Unknown app error' };
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
