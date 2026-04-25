/**
 * Same-origin local runtime loader + cross-origin AI iframe bridge.
 *
 * Two surfaces hang off `shippie.local`:
 *
 *   1. The legacy same-origin runtime — script at `/__shippie/local.js`
 *      attaches `window.shippie.local.{db, files, ai?}`. Used by tests and
 *      by adapters that want to expose their own AI implementation.
 *
 *   2. `shippie.local.ai` — a cross-origin iframe bridge to the Shippie AI
 *      app at `ai.shippie.app`. The iframe holds the real models. The
 *      bridge uses postMessage with origin pinning. If the runtime exposes
 *      its own `ai`, that wins (back-compat for tests and offline dev).
 *
 * Privacy: input text never leaves the device. The iframe runs same-device
 * (different origin), inference happens on-device, results return via
 * postMessage. The only network egress is the initial model download from
 * the Shippie CDN, which is cached after first use.
 */
export interface ShippieLocalRuntimeGlobal {
  version?: string;
  capabilities?: () => unknown;
  db?: unknown;
  files?: unknown;
  ai?: unknown;
}

export interface LoadLocalRuntimeOptions {
  endpoint?: string;
}

let loadPromise: Promise<ShippieLocalRuntimeGlobal> | null = null;

// ---------------------------------------------------------------------------
// AI iframe bridge
// ---------------------------------------------------------------------------

export const SHIPPIE_AI_ORIGIN = 'https://ai.shippie.app';
export const SHIPPIE_AI_INFERENCE_PATH = '/inference.html';

/**
 * The hardware backend that ran an inference. Mirrors the Backend type
 * exported by `apps/shippie-ai`. Mirrored, not imported, because the AI
 * app is not a workspace dependency of @shippie/sdk — they communicate
 * by postMessage, not by import.
 */
export type ShippieAIBackend = 'webnn-npu' | 'webnn-gpu' | 'webgpu' | 'wasm-cpu';

export class ShippieAINotInstalledError extends Error {
  public readonly installUrl: string;
  constructor(message = 'Shippie AI is not installed', installUrl = `${SHIPPIE_AI_ORIGIN}/`) {
    super(message);
    this.name = 'ShippieAINotInstalledError';
    this.installUrl = installUrl;
  }
}

/**
 * Structural subset of `Window` that LocalAI actually uses. Tests inject a
 * happy-dom Window which doesn't satisfy the full DOM `Window` type but
 * does provide these handful of methods.
 */
export interface LocalAIWindowLike {
  addEventListener(type: 'message' | 'pageshow', listener: EventListener): void;
  removeEventListener(type: 'message' | 'pageshow', listener: EventListener): void;
}

/**
 * Structural subset of `Document` that LocalAI uses.
 */
export interface LocalAIDocumentLike {
  createElement(tag: 'iframe'): HTMLIFrameElement;
  body: { appendChild(node: Node): Node };
}

export interface LocalAIDeps {
  /** Override the iframe URL (tests, dev). Default `https://ai.shippie.app/inference.html`. */
  iframeSrc?: string;
  /** Override the document used to create the iframe. Default `globalThis.document`. */
  doc?: LocalAIDocumentLike;
  /** Override the window used to listen for postMessage. Default `globalThis.window`. */
  win?: LocalAIWindowLike;
  /** crypto.randomUUID alternative (tests). */
  randomId?: () => string;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class LocalAI {
  private iframe: HTMLIFrameElement | null = null;
  private ready: Promise<HTMLIFrameElement> | null = null;
  private pending = new Map<string, PendingRequest>();
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private pageshowHandler: (() => void) | null = null;
  private readonly src: string;
  private readonly doc: LocalAIDocumentLike | null;
  private readonly win: LocalAIWindowLike | null;
  private readonly randomId: () => string;

  constructor(deps: LocalAIDeps = {}) {
    this.src = deps.iframeSrc ?? `${SHIPPIE_AI_ORIGIN}${SHIPPIE_AI_INFERENCE_PATH}`;
    this.doc =
      deps.doc ?? (typeof document !== 'undefined' ? (document as unknown as LocalAIDocumentLike) : null);
    this.win = deps.win ?? (typeof window !== 'undefined' ? (window as unknown as LocalAIWindowLike) : null);
    this.randomId =
      deps.randomId ??
      (() =>
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `r-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  }

  classify(
    text: string,
    labels: string[],
  ): Promise<{ label: string; confidence: number; source?: ShippieAIBackend }> {
    return this.infer('classify', { text, labels });
  }

  embed(
    text: string,
  ): Promise<{ embedding: number[]; source?: ShippieAIBackend } | number[]> {
    return this.infer('embed', { text });
  }

  sentiment(
    text: string,
  ): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    source?: ShippieAIBackend;
  }> {
    return this.infer('sentiment', { text });
  }

  moderate(
    text: string,
  ): Promise<{
    flagged: boolean;
    label: string;
    score: number;
    source?: ShippieAIBackend;
  }> {
    return this.infer('moderate', { text });
  }

  /** Lower-level escape hatch; consumers normally call the named helpers. */
  async infer<T = unknown>(task: string, payload: object): Promise<T> {
    const iframe = await this.ensureIframe();
    const requestId = this.randomId();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      const target = iframe.contentWindow;
      if (!target) {
        this.pending.delete(requestId);
        reject(new ShippieAINotInstalledError('Shippie AI iframe lost its window'));
        return;
      }
      target.postMessage(
        { requestId, task, payload },
        SHIPPIE_AI_ORIGIN,
      );
    });
  }

  private ensureIframe(): Promise<HTMLIFrameElement> {
    if (this.ready) return this.ready;
    if (!this.doc || !this.win) {
      return Promise.reject(
        new ShippieAINotInstalledError('shippie.local.ai requires a browser document'),
      );
    }
    const doc = this.doc;
    const win = this.win;

    this.ready = new Promise<HTMLIFrameElement>((resolve, reject) => {
      const iframe = doc.createElement('iframe');
      iframe.src = this.src;
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('title', 'Shippie AI inference frame');
      // Loose sandbox: same-origin (so the iframe's IndexedDB/Cache are
      // its own ai.shippie.app scope) + scripts (so the inference router
      // runs). No allow-popups, allow-forms, allow-top-navigation.
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      this.iframe = iframe;

      const onError = () => {
        cleanup();
        reject(new ShippieAINotInstalledError(`Failed to load ${this.src}`));
      };
      const onReadyMessage = (e: MessageEvent) => {
        if (e.origin !== SHIPPIE_AI_ORIGIN) return;
        const data = e.data as { type?: string } | null;
        if (!data || data.type !== 'ready') return;
        cleanup();
        resolve(iframe);
      };
      const cleanup = () => {
        win.removeEventListener('message', onReadyMessage as EventListener);
        iframe.removeEventListener('error', onError);
      };

      iframe.addEventListener('error', onError);
      win.addEventListener('message', onReadyMessage as EventListener);
      doc.body.appendChild(iframe);
    });

    // The general message handler stays installed for the iframe's lifetime.
    this.messageHandler = (e: MessageEvent) => this.onMessage(e);
    win.addEventListener('message', this.messageHandler as EventListener);

    // iOS Safari sometimes evicts hidden iframes under memory pressure.
    // pageshow fires when the page becomes visible again; if the iframe is
    // dead, drop our cached ready-promise so the next call rebuilds.
    this.pageshowHandler = () => {
      const dead = !this.iframe?.contentWindow;
      if (dead) {
        this.teardown();
      }
    };
    win.addEventListener('pageshow', this.pageshowHandler as EventListener);

    return this.ready;
  }

  private onMessage(e: MessageEvent): void {
    if (e.origin !== SHIPPIE_AI_ORIGIN) return;
    const data = e.data as { requestId?: string; result?: unknown; error?: string } | null;
    if (!data || typeof data.requestId !== 'string') return;
    const p = this.pending.get(data.requestId);
    if (!p) return;
    this.pending.delete(data.requestId);
    if (typeof data.error === 'string') p.reject(new Error(data.error));
    else p.resolve(data.result);
  }

  /** Drop iframe + handlers. Used internally on `pageshow` recovery and tests. */
  teardown(): void {
    if (this.win && this.messageHandler) {
      this.win.removeEventListener('message', this.messageHandler as EventListener);
    }
    if (this.win && this.pageshowHandler) {
      this.win.removeEventListener('pageshow', this.pageshowHandler as EventListener);
    }
    this.messageHandler = null;
    this.pageshowHandler = null;
    if (this.iframe?.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
    this.ready = null;
    // Reject anything still in flight — the iframe is gone, those
    // promises will never resolve naturally.
    for (const p of this.pending.values()) {
      p.reject(new Error('Shippie AI iframe was torn down'));
    }
    this.pending.clear();
  }
}

// Lazily-shared default so multiple SDK consumers don't fight over iframes.
let defaultLocalAI: LocalAI | null = null;
function getDefaultLocalAI(): LocalAI {
  if (!defaultLocalAI) defaultLocalAI = new LocalAI();
  return defaultLocalAI;
}

/** Test seam: replace the singleton (or null to reset). */
export function _setDefaultLocalAIForTest(instance: LocalAI | null): void {
  defaultLocalAI = instance;
}

// ---------------------------------------------------------------------------
// Public local surface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Local groups (Proximity Protocol). Lazy-loaded so apps that don't need
// mesh don't pay the bundle cost.
// ---------------------------------------------------------------------------

type ProximityModule = typeof import('@shippie/proximity');
let groupModulePromise: Promise<ProximityModule> | null = null;

async function loadProximityModule(): Promise<ProximityModule> {
  if (!groupModulePromise) groupModulePromise = import('@shippie/proximity');
  return groupModulePromise;
}

const groupApi = {
  async create(...args: Parameters<ProximityModule['createGroup']>) {
    const mod = await loadProximityModule();
    return mod.createGroup(...args);
  },
  async join(...args: Parameters<ProximityModule['joinGroup']>) {
    const mod = await loadProximityModule();
    return mod.joinGroup(...args);
  },
};

export const local = {
  load,
  capabilities,
  get db() {
    return currentLocalRuntime()?.db;
  },
  get files() {
    return currentLocalRuntime()?.files;
  },
  /**
   * AI access. Prefers a runtime-attached `ai` if present (back-compat with
   * adapters that ship their own implementation, e.g. dev-adapter). Falls
   * back to the cross-origin iframe bridge to ai.shippie.app.
   */
  get ai() {
    const fromRuntime = currentLocalRuntime()?.ai;
    if (fromRuntime) return fromRuntime;
    return getDefaultLocalAI();
  },
  /**
   * Local-network groups via the Shippie Proximity Protocol.
   *
   *   const owner = await shippie.local.group.create({ appSlug: 'whiteboard' });
   *   const guest = await shippie.local.group.join({ appSlug: 'whiteboard', joinCode });
   */
  group: groupApi,
};

export async function load(opts: LoadLocalRuntimeOptions = {}): Promise<ShippieLocalRuntimeGlobal> {
  const existing = currentLocalRuntime();
  if (existing) return existing;
  if (typeof document === 'undefined') throw new Error('shippie.local.load() requires a browser document');
  if (loadPromise) return loadPromise;

  const endpoint = opts.endpoint ?? '/__shippie/local.js';
  loadPromise = new Promise<ShippieLocalRuntimeGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = endpoint;
    script.async = true;
    script.dataset.shippieLocalRuntime = 'true';
    script.onload = () => {
      const runtime = currentLocalRuntime();
      if (runtime) resolve(runtime);
      else reject(new Error('Shippie local runtime loaded but did not attach window.shippie.local'));
    };
    script.onerror = () => reject(new Error(`Failed to load Shippie local runtime from ${endpoint}`));
    document.head.append(script);
  }).finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export async function capabilities(opts: LoadLocalRuntimeOptions = {}): Promise<unknown> {
  const runtime = await load(opts);
  return typeof runtime.capabilities === 'function' ? runtime.capabilities() : null;
}

function currentLocalRuntime(): ShippieLocalRuntimeGlobal | null {
  if (typeof window === 'undefined') return null;
  const runtime = (window as unknown as { shippie?: { local?: ShippieLocalRuntimeGlobal } }).shippie?.local;
  return runtime ?? null;
}
