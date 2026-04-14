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
