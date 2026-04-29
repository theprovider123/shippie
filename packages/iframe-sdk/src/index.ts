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
  /** Trigger the container's permission prompt for an intent the app declares. */
  requestIntent(intent: string): void;
  /** True only when running inside an iframe whose parent isn't the same window. */
  readonly inContainer: boolean;
}

export function createShippieIframeSdk(opts: ShippieIframeSdkOptions): ShippieIframeSdk {
  const { appId } = opts;
  const w = typeof window === 'undefined' ? null : window;
  const inContainer = Boolean(w && w.parent && w.parent !== w);

  function send(capability: string, method: string, payload: Record<string, unknown>): void {
    if (!inContainer || !w) return;
    w.parent.postMessage(
      {
        protocol: PROTOCOL,
        id: `${appId}_${capability}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        appId,
        capability,
        method,
        payload,
      },
      '*',
    );
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
