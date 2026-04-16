/**
 * shippie.install.*
 *
 * PWA install handling. On Android, we intercept the `beforeinstallprompt`
 * event and expose `prompt()` to trigger it on demand. On iOS, there's no
 * programmatic install prompt — the UI shows a guided "Add to Home Screen"
 * banner instead.
 *
 * Install tracking is POSTed to /__shippie/install so the platform can
 * count real installs (device_installs row with heuristic validation).
 *
 * Spec v6 §7.1, §9.4 (iOS reality).
 */
import { post } from './http.ts';
import type { InstallStatus } from './types.ts';

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: DeferredInstallPromptEvent | null = null;
let standaloneReported = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as DeferredInstallPromptEvent;
  });

  // Report first-launch-in-standalone-mode event
  if (matchesStandalone()) {
    if (!standaloneReported) {
      standaloneReported = true;
      void post('/install', { event: 'display_mode_standalone' }).catch(() => {});
    }
  }
}

function matchesStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export function status(): InstallStatus {
  if (matchesStandalone()) return 'installed';
  if (deferredPrompt != null) return 'installable';
  return 'unsupported';
}

export async function prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }> {
  if (!deferredPrompt) {
    return { outcome: 'dismissed' };
  }
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;

  // Record the install_prompt_shown event + user choice
  void post('/install', {
    event: 'prompt_result',
    outcome: choice.outcome,
  }).catch(() => {});

  return choice;
}

/**
 * Returns per-platform instructions the maker can surface in their own
 * UI. Useful for iOS (where there's no programmatic prompt) and for
 * desktop browsers that don't support beforeinstallprompt.
 */
export interface InstallInstructions {
  platform: 'android' | 'ios' | 'desktop-chrome' | 'desktop-safari' | 'desktop-firefox' | 'unknown';
  programmatic: boolean;
  steps: string[];
}

export function instructions(): InstallInstructions {
  if (typeof navigator === 'undefined') {
    return { platform: 'unknown', programmatic: false, steps: [] };
  }

  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  if (isiOS) {
    return {
      platform: 'ios',
      programmatic: false,
      steps: [
        'Tap the Share button in Safari',
        'Scroll down and tap "Add to Home Screen"',
        'Tap "Add" in the top right',
      ],
    };
  }

  if (isAndroid) {
    return {
      platform: 'android',
      programmatic: deferredPrompt != null,
      steps: deferredPrompt
        ? ['Tap "Install" to add this app to your home screen']
        : [
            'Open the browser menu (⋮)',
            'Tap "Install app" or "Add to Home screen"',
            'Confirm the install',
          ],
    };
  }

  if (isSafari) {
    return {
      platform: 'desktop-safari',
      programmatic: false,
      steps: [
        'Open File menu',
        'Choose "Add to Dock"',
      ],
    };
  }

  if (isFirefox) {
    return {
      platform: 'desktop-firefox',
      programmatic: false,
      steps: ['Firefox desktop does not support installing PWAs — use Chrome or Edge.'],
    };
  }

  return {
    platform: 'desktop-chrome',
    programmatic: deferredPrompt != null,
    steps: deferredPrompt
      ? ['Click "Install" in the address bar']
      : [
          'Click the install icon (⊕) in the address bar',
          'Or open the browser menu → "Install {app name}"',
        ],
  };
}
