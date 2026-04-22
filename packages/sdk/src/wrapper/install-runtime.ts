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
import { captureReferral, clearReferral } from './referral.ts';
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
import { observeWebVitals } from './web-vitals.ts';
import { pushSupported } from './push.ts';

export interface StartInstallRuntimeConfig {
  /** Endpoint to POST beacon events to. Default: `/__shippie/install` (maker-subdomain route). */
  trackEndpoint?: string;
  /** Endpoint to POST desktop-handoff requests to. Default: `/__shippie/handoff`. */
  handoffEndpoint?: string;
  /** localStorage key for persisted prompt state. Default: `shippie-install-state`. */
  storageKey?: string;
  /** How often to check dwell time + re-render (ms). Default: 5000. */
  tickMs?: number;
  /**
   * Test-only: web-vitals flush hook. Lets tests trigger a deterministic
   * flush of LCP/CLS/INP samples without waiting for visibilitychange.
   */
  vitalsFlushHandle?: { flush?: () => void };
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

  // Capture `?ref=…` on first page load; persists across SPA nav via the
  // localStorage fallback inside captureReferral. Null when not present.
  const ref = captureReferral(window.location.href);

  // Events that should carry the referral attribution into the event spine.
  // Vitals/handoff samples intentionally skip — they're noise for install
  // attribution and would inflate the payload on every flush.
  const REF_ATTRIBUTED_EVENTS = new Set<string>([
    'prompt_shown',
    'prompt_accepted',
    'prompt_dismissed',
    'iab_detected',
    'iab_bounced',
    'install_click',
  ]);

  const beacon = async (event: string, extra?: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = { event, ...(extra ?? {}) };
      if (REF_ATTRIBUTED_EVENTS.has(event)) {
        payload.ref = ref?.source ?? null;
      }
      const body = JSON.stringify(payload);
      // Attempt 1: sendBeacon — the preferred path. Survives page unload
      // and works while the browser is offline (queued by the UA).
      if (navigator.sendBeacon?.(trackEndpoint, body)) return;
      // Attempt 2: keepalive fetch — survives tab close; landing here means
      // sendBeacon was missing or rejected (e.g., quota, CSP).
      const res = await fetch(trackEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => null);
      if (!res || !res.ok) {
        // Last-ditch: fire-and-forget. Phase 5 may add a real IDB queue here
        // so samples survive hard network outages on SW-less maker apps.
      }
    } catch {
      // swallow — analytics must never break the app
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

    // Detect an existing push subscription asynchronously so we can offer
    // the "send to my installed Shippie" CTA only when it'll actually work.
    // We can't block startInstallRuntime on this check (it must stay sync
    // so the IIFE bundle can return cleanup), so kick off the detection in
    // an IIFE and mount the sheet when it resolves. Cleanup is idempotent.
    let cancelled = false;
    void (async () => {
      let canPush = false;
      if (pushSupported()) {
        try {
          const sw = (navigator as Navigator & {
            serviceWorker: { ready: Promise<ServiceWorkerRegistration> };
          }).serviceWorker;
          const reg = await sw.ready;
          const sub = await reg.pushManager.getSubscription();
          canPush = !!sub;
        } catch {
          canPush = false;
        }
      }
      if (cancelled) return;
      mountHandoffSheet({
        handoffUrl,
        canPush,
        onSendEmail: (email) =>
          postHandoff({ mode: 'email', email, handoff_url: handoffUrl }),
        onSendPush: () =>
          postHandoff({ mode: 'push', handoff_url: handoffUrl }),
      });
      haptic('tap');
      void beacon('handoff_shown');
    })();
    return () => {
      cancelled = true;
      unmountHandoffSheet();
    };
  }

  // Normal path: engagement-gated banner. Also attach the web-vitals
  // observer here — this is the only branch where the user stays on the
  // page long enough for LCP/CLS/INP to be meaningful.
  const detachVitals = observeWebVitals({
    report: (sample) => {
      void beacon('web_vital', {
        name: sample.name,
        value: sample.value,
        id: sample.id,
        navigation: sample.navigationType,
      });
    },
    flushHandle: config.vitalsFlushHandle,
  });

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
            // Clear the stashed referral so the next page load doesn't
            // re-attribute subsequent installs to this source.
            clearReferral();
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
    detachVitals();
    setThemeColor(THEME_DEFAULT);
    unmountAll();
  };
}
