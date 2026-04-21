// apps/web/app/components/install-runtime.tsx
/**
 * Marketplace-side host for the @shippie/sdk/wrapper runtime.
 *
 * This component mounts the vanilla DOM banner / bounce sheet from the
 * shared wrapper package. Dogfoods the exact flow maker apps see.
 *
 * - Persists PromptState in localStorage under `shippie-install-state`.
 * - Listens for `beforeinstallprompt` (Android) and upgrades method to one-tap.
 * - Never renders on the server — all logic is in useEffect.
 */
'use client';

import { useEffect, useRef } from 'react';
import {
  readInstallContext,
  computePromptTier,
  recordVisit,
  recordDismissal,
  addDwell,
  serialize,
  deserialize,
  buildBounceTarget,
  mountInstallBanner,
  mountBounceSheet,
  unmountAll,
  type PromptState,
} from '@shippie/sdk/wrapper';

const STORAGE_KEY = 'shippie-install-state';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallRuntime() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // iOS Safari exposes `standalone` on navigator but it's a non-standard
    // extension not in the DOM lib types — cast so the wrapper can read it.
    const navWithStandalone = navigator as Navigator & { standalone?: boolean };
    const ctx = readInstallContext(
      navigator.userAgent,
      navWithStandalone,
      (q) => window.matchMedia(q),
    );

    // Never in standalone mode.
    if (ctx.standalone) return;

    // IAB bounce: show bounce sheet, skip banner entirely.
    if (ctx.iab && ctx.platform !== 'desktop') {
      const target = buildBounceTarget({
        platform: ctx.platform,
        currentUrl: window.location.href,
      });
      if (target) {
        mountBounceSheet({
          brand: ctx.iab,
          target,
          onBounce: () => {
            // fire-and-forget tracking beacon
            navigator.sendBeacon?.(
              '/__shippie/install',
              JSON.stringify({ event: 'iab_bounced', outcome: ctx.iab }),
            );
          },
          onCopyLink: async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
            } catch {
              // clipboard may be blocked in some IABs — fall through silently
            }
          },
        });
        navigator.sendBeacon?.(
          '/__shippie/install',
          JSON.stringify({ event: 'iab_detected', outcome: ctx.iab }),
        );
      }
      return () => unmountAll();
    }

    // Load + update prompt state.
    const prior = deserialize(localStorage.getItem(STORAGE_KEY));
    const now = Date.now();
    let state: PromptState = recordVisit(prior, now);
    localStorage.setItem(STORAGE_KEY, serialize(state));

    // Capture Android one-tap availability.
    const onBip = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // Track dwell time while tab is visible.
    let lastTick = Date.now();
    const tickInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastTick = Date.now();
        return;
      }
      const now2 = Date.now();
      state = addDwell(state, now2 - lastTick);
      lastTick = now2;
      localStorage.setItem(STORAGE_KEY, serialize(state));
      render();
    }, 5000);

    function render() {
      const tier = computePromptTier(state, Date.now());
      mountInstallBanner({
        tier,
        onInstall: async () => {
          if (deferredPromptRef.current) {
            await deferredPromptRef.current.prompt();
            const outcome = (await deferredPromptRef.current.userChoice).outcome;
            navigator.sendBeacon?.(
              '/__shippie/install',
              JSON.stringify({ event: `prompt_${outcome}` }),
            );
            if (outcome === 'accepted') {
              state = recordDismissal(state, Date.now());
              localStorage.setItem(STORAGE_KEY, serialize(state));
              unmountAll();
            }
            return;
          }
          // Non-Android: surface per-platform instructions via a fuller sheet.
          // Phase 1 keeps this minimal — log for now; full guide UI lands in Phase 2.
          navigator.sendBeacon?.(
            '/__shippie/install',
            JSON.stringify({ event: 'prompt_shown', outcome: 'manual-guide-opened' }),
          );
        },
        onDismiss: () => {
          state = recordDismissal(state, Date.now());
          localStorage.setItem(STORAGE_KEY, serialize(state));
          navigator.sendBeacon?.(
            '/__shippie/install',
            JSON.stringify({ event: 'prompt_dismissed' }),
          );
          unmountAll();
        },
      });
    }

    render();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      clearInterval(tickInterval);
      unmountAll();
    };
  }, []);

  return null;
}
