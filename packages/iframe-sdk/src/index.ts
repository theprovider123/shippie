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

export interface AppsListEntry {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  labelKind: 'Local' | 'Connected' | 'Cloud';
  provides: readonly string[];
  consumes: readonly string[];
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
  /** Trigger the container's permission prompt for an intent the app declares. */
  requestIntent(intent: string): void;
  /** True only when running inside an iframe whose parent isn't the same window. */
  readonly inContainer: boolean;
}

export function createShippieIframeSdk(opts: ShippieIframeSdkOptions): ShippieIframeSdk {
  const { appId } = opts;
  const w = typeof window === 'undefined' ? null : window;
  const inContainer = Boolean(w && w.parent && w.parent !== w);

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
