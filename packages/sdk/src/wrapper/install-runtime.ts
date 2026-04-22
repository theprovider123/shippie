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
import { buildHandoffUrl } from './handoff.ts';
import { mountHandoffSheet, unmountHandoffSheet } from './handoff-sheet.ts';
import { haptic } from './haptics.ts';
import { setThemeColor } from './theme-color.ts';
import { mountInstallBanner, mountBounceSheet, unmountAll } from './ui.ts';

export interface StartInstallRuntimeConfig {
  /** Endpoint to POST beacon events to. Default: `/__shippie/install` (maker-subdomain route). */
  trackEndpoint?: string;
  /** Endpoint to POST desktop-handoff requests to. Default: `/__shippie/handoff`. */
  handoffEndpoint?: string;
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
const DEFAULT_HANDOFF_ENDPOINT = '/__shippie/handoff';
const DEFAULT_STORAGE_KEY = 'shippie-install-state';
const DEFAULT_TICK_MS = 5000;

// Brand palette — matches the install banner's coral and the default
// Shippie dark-background theme-color declared in apps/web.
const THEME_BANNER = '#E8603C';
const THEME_DEFAULT = '#14120F';

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
  const handoffEndpoint = config.handoffEndpoint ?? DEFAULT_HANDOFF_ENDPOINT;
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
      haptic('warn');
      beacon('iab_detected', { brand: ctx.iab });
    }
    return () => unmountAll();
  }

  // Desktop handoff: no PWA install path on desktop — help the user
  // continue on mobile via QR, email-to-self, or push (Phase 3).
  if (ctx.platform === 'desktop' && ctx.iab === null) {
    const handoffUrl = buildHandoffUrl(window.location.href);

    const postHandoff = async (body: Record<string, unknown>): Promise<void> => {
      try {
        await fetch(handoffEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        haptic('success');
      } catch (err) {
        // Best-effort — log once, buzz error, don't throw.
        console.warn('[shippie] handoff POST failed', err);
        haptic('error');
      }
    };

    mountHandoffSheet({
      handoffUrl,
      canPush: false,
      onSendEmail: (email) =>
        postHandoff({ mode: 'email', email, handoff_url: handoffUrl }),
      onSendPush: () =>
        postHandoff({ mode: 'push', handoff_url: handoffUrl }),
    });
    haptic('tap');
    beacon('handoff_shown');
    return () => unmountHandoffSheet();
  }

  // Normal path: engagement-gated banner.
  const prior = deserialize(localStorage.getItem(storageKey));
  const now = Date.now();
  const refs = {
    state: recordVisit(prior, now),
    deferredPrompt: null as BeforeInstallPromptEvent | null,
    lastTick: Date.now(),
    lastRenderedTier: null as PromptTier | null,
  };
  localStorage.setItem(storageKey, serialize(refs.state));

  const onBip = (event: Event) => {
    event.preventDefault();
    refs.deferredPrompt = event as BeforeInstallPromptEvent;
    render();
  };
  window.addEventListener('beforeinstallprompt', onBip);

  const render = (): void => {
    const tier = computePromptTier(refs.state, Date.now());
    if (tier === refs.lastRenderedTier) return;
    refs.lastRenderedTier = tier;
    if (tier !== 'none') {
      // Tint status bar to match the banner while it's visible.
      setThemeColor(THEME_BANNER);
    }
    mountInstallBanner({
      tier,
      onInstall: async () => {
        haptic('tap');
        if (refs.deferredPrompt) {
          await refs.deferredPrompt.prompt();
          const outcome = (await refs.deferredPrompt.userChoice).outcome;
          beacon(`prompt_${outcome}`);
          if (outcome === 'accepted') {
            refs.state = recordDismissal(refs.state, Date.now());
            localStorage.setItem(storageKey, serialize(refs.state));
            setThemeColor(THEME_DEFAULT);
            unmountAll();
          }
          return;
        }
        // iOS / manual: Phase 2 lands the full guide sheet.
        beacon('prompt_shown', { outcome: 'manual-guide-opened' });
      },
      onDismiss: () => {
        refs.state = recordDismissal(refs.state, Date.now());
        localStorage.setItem(storageKey, serialize(refs.state));
        beacon('prompt_dismissed');
        setThemeColor(THEME_DEFAULT);
        unmountAll();
      },
    });
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState !== 'visible') {
      refs.lastTick = Date.now();
      return;
    }
    const t = Date.now();
    refs.state = addDwell(refs.state, t - refs.lastTick);
    refs.lastTick = t;
    localStorage.setItem(storageKey, serialize(refs.state));
    render();
  }, tickMs);

  render();

  return () => {
    window.removeEventListener('beforeinstallprompt', onBip);
    window.clearInterval(interval);
    setThemeColor(THEME_DEFAULT);
    unmountAll();
  };
}
