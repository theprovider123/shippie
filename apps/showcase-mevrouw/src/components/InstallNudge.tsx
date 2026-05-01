import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn.ts';

// Stores the wall-clock ms of the last dismiss, not just a boolean.
// 7-day cooldown lets the nudge resurface for users who tapped "×" by
// accident or who came back later wanting to install. iOS Safari's own
// share-sheet prompt operates on a similar cadence.
export const INSTALL_NUDGE_KEY = 'mev:install-nudge-dismissed-at';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios-safari' | 'android-chrome' | 'standalone' | 'other';

function detect(): Platform {
  if (typeof window === 'undefined') return 'other';
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return 'standalone';
  const ua = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIos && isSafari) return 'ios-safari';
  if (/Android/.test(ua) && /Chrome/.test(ua)) return 'android-chrome';
  return 'other';
}

function isWithinCooldown(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(INSTALL_NUDGE_KEY);
  if (!raw) return false;
  // Legacy '1' value from prior builds: treat as "dismissed long ago"
  // so the nudge re-appears once after this build lands. The 7-day
  // cooldown then kicks in normally.
  if (raw === '1') return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || at <= 0) return false;
  return Date.now() - at < COOLDOWN_MS;
}

export function resetInstallNudge(): void {
  try {
    localStorage.removeItem(INSTALL_NUDGE_KEY);
  } catch {
    // private mode etc
  }
}

export function InstallNudge() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => isWithinCooldown());

  useEffect(() => {
    setPlatform(detect());

    function onBip(e: Event) {
      e.preventDefault();
      setBipEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      // Fired by the browser after the user installs the PWA from the
      // share sheet / Chrome's native prompt. Auto-dismiss in this
      // (still-open) pre-install tab.
      setDismissed(true);
      setBipEvent(null);
      try {
        localStorage.setItem(INSTALL_NUDGE_KEY, String(Date.now()));
      } catch {
        /* best effort */
      }
    }
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);

    // Re-check display-mode reactively. iOS Safari can flip from
    // browser to standalone without a full reload (PWA opens via the
    // home-screen icon while a Safari tab is still open).
    const mq = window.matchMedia?.('(display-mode: standalone)');
    function onMq() {
      setPlatform(detect());
    }
    mq?.addEventListener?.('change', onMq);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  if (dismissed) return null;
  if (platform === 'standalone' || platform === 'other') return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_NUDGE_KEY, String(Date.now()));
    } catch {
      // private mode etc — best-effort
    }
  }

  async function triggerInstall() {
    if (!bipEvent) return;
    await bipEvent.prompt();
    await bipEvent.userChoice;
    setBipEvent(null);
    dismiss();
  }

  return (
    <div
      className={cn(
        'fixed bottom-24 left-3 right-3 z-40',
        'rounded-2xl border border-[var(--gold)] bg-[var(--card)] p-3',
        'flex flex-col gap-2 shadow-lg',
      )}
      role="dialog"
      aria-label="Install Mevrouw"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Add Mevrouw to your phone
          </p>
          <p className="font-serif text-sm">
            {platform === 'ios-safari'
              ? 'Tap Share → Add to Home Screen.'
              : 'Install for full-screen, offline use.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider px-2 py-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      {platform === 'ios-safari' && (
        <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
          In Safari, tap the <span className="font-mono">↑</span> share icon at
          the bottom of the screen, then choose <em>Add to Home Screen</em>. It
          opens like a real app — full-screen, no Safari bar.
        </p>
      )}
      {platform === 'android-chrome' && bipEvent && (
        <button
          type="button"
          onClick={triggerInstall}
          className="self-start rounded-md bg-[var(--gold)] text-[var(--background)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider"
        >
          Install
        </button>
      )}
      {platform === 'android-chrome' && !bipEvent && (
        <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
          In Chrome, tap the menu (⋮) and choose <em>Install app</em>. It opens
          full-screen, no browser chrome.
        </p>
      )}
    </div>
  );
}
