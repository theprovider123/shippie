// packages/sdk/src/wrapper/observe-init.ts
/**
 * Bootstrap that hooks the DOM observer into the wrapper's runtime.
 *
 * The Worker injects `<script src="/__shippie/observe.js" async>` into
 * every Shippie-served page; that bundle calls `bootstrapObserve()` on
 * load. The maker's `shippie.json` (read out of `window.__shippie_meta`
 * which the Worker also injects) carries the `enhance:` config.
 *
 * SSR-safe: no-ops if document/window aren't available.
 */
import { startObserve } from './observe/index.ts';
import { installPatina } from './patina/index.ts';
import {
  attachBackSwipe,
  attachKeyboardAvoidance,
  attachPressFeedback,
  attachPullToRefresh,
} from './gestures.ts';
import type { EnhanceConfig } from './observe/types.ts';

interface ShippieMeta {
  enhance?: EnhanceConfig | false;
  intelligence?: {
    spatial?: boolean;
    predictivePreload?: boolean;
    predictivePreloadThreshold?: number;
  };
}

let started = false;
let immersiveDefaultsStarted = false;

export function bootstrapObserve(metaOverride?: ShippieMeta): void {
  if (started) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const meta =
    metaOverride ??
    (window as unknown as { __shippie_meta?: ShippieMeta }).__shippie_meta ??
    {};

  // Maker can disable enhancement entirely with `"enhance": false`.
  if (meta.enhance === false) return;

  const config = meta.enhance ?? defaultConfig();
  if (!config || Object.keys(config).length === 0) return;

  const run = () => {
    if (started) return;
    started = true;
    startObserve({ config });
    installImmersiveDefaults();
    // Patina is cosmetic + cosmetic-only; failures are swallowed inside
    // installPatina, so fire-and-forget without awaiting.
    void installPatina();
    installPageViewEmitter();
    // Fire the initial-load page view after the emitter is wired so any
    // wrapper-internal listeners (e.g. @shippie/intelligence) installed
    // during the same tick still see it.
    dispatchPageView();
    // Defer the ambient drain + insight render to a microtask so it
    // can't extend the synchronous bootstrap path. Failures are swallowed
    // — ambient surfaces are best-effort and never block app boot.
    queueMicrotask(() => {
      void surfaceAmbientInsights();
    });
    // Optional intelligence opt-ins from shippie.json `intelligence:` block.
    // Both swallow failures; missing package or no patterns yet → no-op.
    const intel = meta.intelligence ?? {};
    if (intel.spatial) {
      queueMicrotask(() => {
        void observeCurrentSpace();
      });
    }
    if (intel.predictivePreload) {
      queueMicrotask(() => {
        void enablePredictivePreloadIfAvailable(intel.predictivePreloadThreshold);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

function installImmersiveDefaults(): void {
  if (immersiveDefaultsStarted) return;
  immersiveDefaultsStarted = true;
  attachPressFeedback(document);
  attachKeyboardAvoidance(document);
  attachPullToRefresh(document.documentElement, {
    threshold: 72,
    onRefresh: () => {
      try {
        const ev = new CustomEvent('shippie:refresh', {
          cancelable: true,
          detail: { source: 'pull' },
        });
        const allowed = window.dispatchEvent(ev);
        const reloadOptIn = document.documentElement.dataset.shippieRefreshDefault === 'reload';
        if (allowed && reloadOptIn && !document.hidden) window.location.reload();
      } catch {
        /* refresh is best-effort */
      }
    },
  });
  attachBackSwipe({
    edgeWidth: 18,
    threshold: 72,
    onTrigger: () => {
      try {
        const ev = new CustomEvent('shippie:back', { cancelable: true });
        const allowed = window.dispatchEvent(ev);
        if (allowed && history.length > 1) history.back();
      } catch {
        /* back gesture is best-effort */
      }
    },
  });
}

/**
 * SPA navigation -> `shippie:pageview` bridge.
 *
 * Contract:
 *   We dispatch a `CustomEvent('shippie:pageview', { detail: { path } })`
 *   on `window` whenever the visible URL changes. Listeners (such as
 *   @shippie/intelligence's event source) treat each dispatch as one
 *   logical page view.
 *
 *   To capture every navigation kind we:
 *     1. Patch `history.pushState` and `history.replaceState`. The DOM does
 *        NOT emit any event for these, so without the patch SPA navs are
 *        invisible to us.
 *     2. Listen to `popstate`. Browsers fire this naturally on back/forward
 *        and on hash changes. We do NOT need to (and must not) re-dispatch
 *        from inside the pushState patch on the back/forward path — those
 *        codepaths don't go through pushState. So there is no double-dispatch
 *        risk between the patch and the popstate listener.
 *
 *   Idempotency: `installPageViewEmitter` guards against double-patching with
 *   a `__shippie_pv_installed` marker on `window`. Calling `bootstrapObserve`
 *   twice (e.g. dev HMR) won't stack listeners or double-wrap the History
 *   methods.
 */
const PAGE_VIEW_EVENT = 'shippie:pageview';
const PV_INSTALLED_FLAG = '__shippie_pv_installed';
const NAV_STATE_EVENT = 'shippie:navigation-state';
const NAV_BACK_EVENT = 'shippie:navigation-back';
let navDepth = 0;

function dispatchPageView(): void {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(PAGE_VIEW_EVENT, { detail: { path: location.pathname } }),
    );
    postNavigationState();
  } catch {
    // No-op: dispatch should never throw, but if a polyfilled CustomEvent
    // misbehaves we'd rather lose one analytics tick than crash the page.
  }
}

function installPageViewEmitter(): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w[PV_INSTALLED_FLAG]) return;
  w[PV_INSTALLED_FLAG] = true;

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = function patchedPushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    origPush(data, unused, url ?? null);
    navDepth += 1;
    dispatchPageView();
  } as typeof history.pushState;

  history.replaceState = function patchedReplaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    origReplace(data, unused, url ?? null);
    dispatchPageView();
  } as typeof history.replaceState;

  window.addEventListener('popstate', () => {
    navDepth = Math.max(0, navDepth - 1);
    dispatchPageView();
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data as { type?: string } | null;
    if (!data || data.type !== NAV_BACK_EVENT) return;
    if (navDepth > 0) {
      history.back();
      postNavigationBackResult(true);
    } else {
      postNavigationBackResult(false);
    }
  });
  postNavigationState();
}

function postNavigationState(): void {
  try {
    if (window.parent === window) return;
    window.parent.postMessage(
      { type: NAV_STATE_EVENT, canGoBack: navDepth > 0 },
      '*',
    );
  } catch {
    /* parent may be unavailable */
  }
}

function postNavigationBackResult(handled: boolean): void {
  try {
    if (window.parent === window) return;
    window.parent.postMessage(
      { type: 'shippie:navigation-back-result', handled },
      '*',
    );
  } catch {
    /* parent may be unavailable */
  }
}

/**
 * The platform's default enhance config — what every Shippie app gets
 * out of the box without any shippie.json `enhance:` block. Keeps the
 * "automatic" promise alive even for makers who haven't read the docs.
 */
function defaultConfig(): EnhanceConfig {
  return {
    'video[autoplay], canvas[data-shippie-canvas]': ['wakelock'],
    '[data-shippie-share-target]': ['share-target'],
    // The textures rule is page-global — selector doesn't matter, the
    // rule attaches delegated listeners at the document level on first apply.
    body: ['textures'],
  };
}

/**
 * Bridge to `shippie.local.ai` exposed by the open AI tab. The contract
 * was set up in earlier ambient-intelligence tasks; we feature-detect both
 * methods so a missing bridge just means we skip the AI drain.
 */
interface LocalAiBridge {
  embed?: (text: string) => Promise<{ embedding: number[] }>;
  sentiment?: (text: string) => Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
  }>;
}

interface ShippieLocalGlobal {
  ai?: LocalAiBridge;
}

interface AmbientFacade {
  drainQueue?: () => Promise<unknown>;
  listUndismissed: (opts?: { collection?: string }) => Promise<
    Array<{ id: string; title: string; summary: string; href?: string }>
  >;
  dismiss?: (id: string) => Promise<void>;
}

/**
 * Surface any undismissed insights on app open and, when an AI bridge is
 * reachable, drain the ambient queue. Lazy-imports `@shippie/ambient` and
 * `./insight-card.ts` so the cost is zero on pages that have no insights.
 */
async function surfaceAmbientInsights(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const ambient = (await import('@shippie/ambient')) as unknown as AmbientFacade;
    const bridge = (window as unknown as { 'shippie.local'?: ShippieLocalGlobal })[
      'shippie.local'
    ]?.ai;
    if (bridge && (bridge.embed || bridge.sentiment) && typeof ambient.drainQueue === 'function') {
      try {
        await ambient.drainQueue();
      } catch {
        // Drain failures don't block insight rendering — the queue stays
        // intact for the next open.
      }
    }

    const insights = await ambient.listUndismissed();
    if (!insights || insights.length === 0) return;

    const { mountInsightCards } = await import('./insight-card.ts');
    mountInsightCards({
      insights: insights.map((i) => ({
        id: i.id,
        title: i.title,
        summary: i.summary,
        href: i.href,
      })),
      onDismiss: (id) => {
        try {
          void ambient.dismiss?.(id);
        } catch {
          // Dismiss persistence is best-effort; the visual dismissal
          // already happened in the card itself.
        }
      },
    });
  } catch {
    // Ambient is opt-in. If the package isn't available or anything else
    // goes wrong, the wrapper continues to function normally.
  }
}

/**
 * D2: spatial-memory observation. Records the current physical context
 * (WiFi BSSID hash or rounded geo) on app open so future patterns can
 * be scoped by space. Opt-in via shippie.json.intelligence.spatial.
 */
async function observeCurrentSpace(): Promise<void> {
  try {
    const intel = (await import('@shippie/intelligence')) as unknown as {
      currentSpace?: () => Promise<unknown>;
    };
    await intel.currentSpace?.();
  } catch {
    /* swallow — spatial is opt-in cosmetic */
  }
}

/**
 * D2: predictive page preload. Pre-renders the next page the user
 * usually visits via `<link rel="prefetch">`. Opt-in via
 * shippie.json.intelligence.predictivePreload.
 */
async function enablePredictivePreloadIfAvailable(threshold?: number): Promise<void> {
  try {
    const intel = (await import('@shippie/intelligence')) as unknown as {
      enablePredictivePreload?: (opts?: { confidenceThreshold?: number }) => () => void;
    };
    intel.enablePredictivePreload?.({
      confidenceThreshold: typeof threshold === 'number' ? threshold : undefined,
    });
  } catch {
    /* swallow — predictive preload is opt-in cosmetic */
  }
}
