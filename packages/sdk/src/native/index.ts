/**
 * Shippie Native Bridge (phase 1 APIs).
 *
 * Feature-detecting layer. On the web it progressively enhances with
 * Web APIs where available (Web Share, Vibration, Notifications,
 * Clipboard). Inside a Capacitor-wrapped app, Capacitor plugins take
 * over via `window.Capacitor`.
 *
 * The native readiness score rewards apps that use at least one Native
 * Bridge feature — that's what moves a PWA wrapper past Apple's Rule 4.2
 * "minimum functionality" threshold.
 *
 * Spec v6 §7.3, §13.
 */

interface CapacitorBridge {
  Plugins?: Record<string, unknown>;
  convertFileSrc?: (src: string) => string;
  platform?: string;
}

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

function isCapacitor(): boolean {
  const cap = getCapacitor();
  return Boolean(cap?.Plugins);
}

/* ------------------------------------------------------------------ *
 * share                                                              *
 * ------------------------------------------------------------------ */

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

export const share = async (data: ShareOptions): Promise<{ shared: boolean }> => {
  const cap = getCapacitor();
  if (cap?.Plugins?.Share) {
    await (cap.Plugins.Share as { share: (o: ShareOptions) => Promise<unknown> }).share(data);
    return { shared: true };
  }

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (d: ShareOptions) => Promise<void> }).share(data);
      return { shared: true };
    } catch {
      return { shared: false };
    }
  }

  // Last-resort: copy URL to clipboard
  if (data.url && typeof navigator !== 'undefined') {
    const clip = (navigator as unknown as { clipboard?: { writeText: (s: string) => Promise<void> } })
      .clipboard;
    if (clip) {
      await clip.writeText(data.url);
      return { shared: true };
    }
  }

  return { shared: false };
};

/* ------------------------------------------------------------------ *
 * haptics                                                            *
 * ------------------------------------------------------------------ */

export type HapticImpact = 'light' | 'medium' | 'heavy';

export const haptics = {
  async impact(style: HapticImpact = 'medium'): Promise<void> {
    const cap = getCapacitor();
    if (cap?.Plugins?.Haptics) {
      await (cap.Plugins.Haptics as { impact: (o: { style: HapticImpact }) => Promise<void> }).impact({
        style,
      });
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const ms = style === 'light' ? 10 : style === 'medium' ? 20 : 40;
      navigator.vibrate?.(ms);
    }
  },
};

/* ------------------------------------------------------------------ *
 * deviceInfo                                                         *
 * ------------------------------------------------------------------ */

export interface DeviceInfo {
  platform: 'web' | 'ios' | 'android' | 'desktop' | 'unknown';
  inCapacitor: boolean;
  userAgent: string;
}

export const deviceInfo = async (): Promise<DeviceInfo> => {
  const cap = getCapacitor();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (cap?.platform === 'ios') {
    return { platform: 'ios', inCapacitor: true, userAgent: ua };
  }
  if (cap?.platform === 'android') {
    return { platform: 'android', inCapacitor: true, userAgent: ua };
  }

  if (/iPad|iPhone|iPod/.test(ua)) return { platform: 'ios', inCapacitor: false, userAgent: ua };
  if (/Android/.test(ua)) return { platform: 'android', inCapacitor: false, userAgent: ua };
  if (/Mac|Win|Linux/.test(ua)) return { platform: 'desktop', inCapacitor: false, userAgent: ua };

  return { platform: 'web', inCapacitor: false, userAgent: ua };
};

/* ------------------------------------------------------------------ *
 * clipboard                                                          *
 * ------------------------------------------------------------------ */

export const clipboard = {
  async write(text: string): Promise<void> {
    const cap = getCapacitor();
    if (cap?.Plugins?.Clipboard) {
      await (cap.Plugins.Clipboard as { write: (o: { string: string }) => Promise<void> }).write({
        string: text,
      });
      return;
    }
    if (typeof navigator !== 'undefined') {
      const clip = (navigator as unknown as { clipboard?: { writeText: (s: string) => Promise<void> } })
        .clipboard;
      if (clip) await clip.writeText(text);
    }
  },
};

/* ------------------------------------------------------------------ *
 * appState                                                           *
 * ------------------------------------------------------------------ */

export const appState = {
  onResume(listener: () => void): () => void {
    if (typeof document === 'undefined') return () => {};

    const handler = () => {
      if (document.visibilityState === 'visible') listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  },
};

/* ------------------------------------------------------------------ *
 * notifications (local scheduled)                                    *
 * ------------------------------------------------------------------ */

export const notifications = {
  async scheduleLocal(opts: { title: string; body: string; delayMs?: number }): Promise<void> {
    const cap = getCapacitor();
    if (cap?.Plugins?.LocalNotifications) {
      await (
        cap.Plugins.LocalNotifications as {
          schedule: (o: { notifications: unknown[] }) => Promise<unknown>;
        }
      ).schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_147_483_647),
            title: opts.title,
            body: opts.body,
            schedule: opts.delayMs ? { at: new Date(Date.now() + opts.delayMs) } : undefined,
          },
        ],
      });
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      if (opts.delayMs && opts.delayMs > 0) {
        setTimeout(() => new Notification(opts.title, { body: opts.body }), opts.delayMs);
      } else {
        new Notification(opts.title, { body: opts.body });
      }
    }
  },

  async requestPermission(): Promise<'granted' | 'denied' | 'default'> {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.requestPermission();
  },
};

/* ------------------------------------------------------------------ *
 * appReview                                                          *
 * ------------------------------------------------------------------ */

export const appReview = {
  async request(): Promise<void> {
    const cap = getCapacitor();
    if (cap?.Plugins?.AppReview) {
      await (cap.Plugins.AppReview as { request: () => Promise<void> }).request();
      return;
    }
    // Web fallback: no-op (store review only exists in native)
  },
};

/* ------------------------------------------------------------------ *
 * deepLink                                                           *
 * ------------------------------------------------------------------ */

export const deepLink = {
  register(scheme: string, handler: (url: URL) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ url: string }>).detail;
      if (detail?.url?.startsWith(`${scheme}://`)) {
        handler(new URL(detail.url));
      }
    };
    window.addEventListener('shippie:deeplink', onOpen);
    return () => window.removeEventListener('shippie:deeplink', onOpen);
  },
};

export const isInCapacitor = isCapacitor;
