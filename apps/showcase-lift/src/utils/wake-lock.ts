/**
 * Screen Wake Lock helper. Prevents iOS / Android from auto-dimming the
 * screen mid-workout. Releases on workout end, page hide, or unmount.
 *
 * The Wake Lock API isn't supported in all browsers (Firefox iOS, older
 * WebViews). We degrade silently — the user just sees normal dimming.
 */

interface MinimalWakeLockSentinel {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(event: 'release', handler: () => void): void;
}

interface WakeLockState {
  sentinel: MinimalWakeLockSentinel | null;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request(type: 'screen'): Promise<MinimalWakeLockSentinel> };
}

export function createWakeLock(): {
  acquire: () => Promise<void>;
  release: () => Promise<void>;
  isSupported: () => boolean;
} {
  const state: WakeLockState = { sentinel: null };

  const nav = (): NavigatorWithWakeLock | null =>
    typeof navigator !== 'undefined' ? (navigator as unknown as NavigatorWithWakeLock) : null;

  const isSupported = () => Boolean(nav()?.wakeLock);

  const acquire = async () => {
    const wakeLock = nav()?.wakeLock;
    if (!wakeLock || state.sentinel) return;
    try {
      const sentinel = await wakeLock.request('screen');
      state.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        state.sentinel = null;
      });
    } catch {
      // ignore — user revoked or browser blocked
    }
  };

  const release = async () => {
    if (state.sentinel && !state.sentinel.released) {
      try {
        await state.sentinel.release();
      } catch {
        // ignore
      }
    }
    state.sentinel = null;
  };

  return { acquire, release, isSupported };
}
