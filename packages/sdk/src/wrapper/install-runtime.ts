// packages/sdk/src/wrapper/install-runtime.ts
/**
 * Framework-agnostic runtime that wires every piece of the install funnel.
 *
 * Consumers:
 *   - `apps/web` mounts it inside a React useEffect (see `InstallRuntime`
 *     component — thin wrapper around this function).
 *   - The IIFE bundle served at `/__shippie/sdk.js` on maker subdomains
 *     auto-calls it on load, giving every maker app the wrapper with
 *     zero code changes.
 *
 * Everything is driven from injected config so the same code runs on
 * `shippie.app` (marketplace) and `*.shippie.app` (maker apps) — the
 * only difference is the `trackEndpoint` each hits for analytics.
 *
 * Returns a cleanup function that tears down listeners and the DOM.
 * Calling it twice is safe; the second call's cleanup supersedes the first.
 */
import { readInstallContext } from './detect.ts';
import {
  computePromptTier,
  recordVisit,
  recordDismissal,
  addDwell,
  serialize,
  deserialize,
  type PromptState,
  type PromptTier,
} from './install-prompt.ts';
import { buildBounceTarget } from './iab-bounce.ts';
import { mountInstallBanner, mountBounceSheet, unmountAll } from './ui.ts';

export interface StartInstallRuntimeConfig {
  /** Endpoint to POST beacon events to. Default: `/__shippie/install` (maker-subdomain route). */
  trackEndpoint?: string;
  /** localStorage key for persisted prompt state. Default: `shippie-install-state`. */
  storageKey?: string;
  /** How often to check dwell time + re-render (ms). Default: 5000. */
  tickMs?: number;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DEFAULT_TRACK_ENDPOINT = '/__shippie/install';
const DEFAULT_STORAGE_KEY = 'shippie-install-state';
const DEFAULT_TICK_MS = 5000;

/**
 * Boot the install runtime. Detects the user's context, mounts banner or
 * bounce sheet, persists state, tracks dwell + install events. Returns a
 * cleanup function.
 *
 * Safe to call in non-browser contexts — returns a no-op cleanup if
 * `window` or `document` is undefined.
 */
export function startInstallRuntime(
  config: StartInstallRuntimeConfig = {},
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const trackEndpoint = config.trackEndpoint ?? DEFAULT_TRACK_ENDPOINT;
  const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  const tickMs = config.tickMs ?? DEFAULT_TICK_MS;

  const beacon = (event: string, extra?: Record<string, unknown>) => {
    try {
      const body = JSON.stringify({ event, ...(extra ?? {}) });
      navigator.sendBeacon?.(trackEndpoint, body);
    } catch {
      // sendBeacon can throw in edge cases (e.g., storage quota, CSP).
      // Swallow — this is best-effort analytics.
    }
  };

  const navWithStandalone = navigator as Navigator & { standalone?: boolean };
  const ctx = readInstallContext(
    navigator.userAgent,
    navWithStandalone,
    (q) => window.matchMedia(q),
  );

  // Never in standalone mode — user has already installed.
  if (ctx.standalone) return () => {};

  // IAB bounce: show the bounce sheet instead of the install banner.
  if (ctx.iab && ctx.platform !== 'desktop') {
    const target = buildBounceTarget({
      platform: ctx.platform,
      currentUrl: window.location.href,
    });
    if (target) {
      mountBounceSheet({
        brand: ctx.iab,
        target,
        onBounce: () => beacon('iab_bounced', { brand: ctx.iab }),
        onCopyLink: async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
          } catch {
            // clipboard may be blocked — silently continue
          }
        },
      });
      beacon('iab_detected', { brand: ctx.iab });
    }
    return () => unmountAll();
  }

  // Normal path: engagement-gated banner.
  const prior = deserialize(localStorage.getItem(storageKey));
  const now = Date.now();
  let state: PromptState = recordVisit(prior, now);
  localStorage.setItem(storageKey, serialize(state));

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const onBip = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    render();
  };
  window.addEventListener('beforeinstallprompt', onBip);

  let lastTick = Date.now();
  let lastRenderedTier: PromptTier | null = null;

  const render = (): void => {
    const tier = computePromptTier(state, Date.now());
    if (tier === lastRenderedTier) return;
    lastRenderedTier = tier;
    mountInstallBanner({
      tier,
      onInstall: async () => {
        if (deferredPrompt) {
          await deferredPrompt.prompt();
          const outcome = (await deferredPrompt.userChoice).outcome;
          beacon(`prompt_${outcome}`);
          if (outcome === 'accepted') {
            state = recordDismissal(state, Date.now());
            localStorage.setItem(storageKey, serialize(state));
            unmountAll();
          }
          return;
        }
        // iOS / manual: Phase 2 lands the full guide sheet.
        beacon('prompt_shown', { outcome: 'manual-guide-opened' });
      },
      onDismiss: () => {
        state = recordDismissal(state, Date.now());
        localStorage.setItem(storageKey, serialize(state));
        beacon('prompt_dismissed');
        unmountAll();
      },
    });
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState !== 'visible') {
      lastTick = Date.now();
      return;
    }
    const t = Date.now();
    state = addDwell(state, t - lastTick);
    lastTick = t;
    localStorage.setItem(storageKey, serialize(state));
    render();
  }, tickMs);

  render();

  return () => {
    window.removeEventListener('beforeinstallprompt', onBip);
    window.clearInterval(interval);
    unmountAll();
  };
}
