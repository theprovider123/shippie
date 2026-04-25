// packages/sdk/src/wrapper/observe/rules/wakelock.ts
/**
 * Wake Lock rule — keeps the screen on while a video plays or a canvas
 * is active (cooking apps, fitness, presentations, drawing).
 *
 * Browsers require a user gesture to acquire `screen.wakeLock`, so the
 * rule registers an *intent* on element-mount and acquires on the next
 * pointerdown / keydown / touchstart. This means screens may turn off
 * for ~2s on cold-start before first interaction — acceptable.
 *
 * Acquisition is shared: many elements may want a wake lock, but the
 * page only needs one. We refcount and release when the last consumer
 * unmounts.
 */
import type { EnhanceRule } from '../types.ts';

interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(t: 'release', l: () => void): void;
}
type Nav = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } };

let consumers = 0;
let sentinel: WakeLockSentinel | null = null;
let pendingAcquire = false;
let gestureBound = false;

function bindGestureOnce(): void {
  if (gestureBound) return;
  gestureBound = true;
  const handler = () => {
    if (consumers > 0) tryAcquire();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, handler, { once: false, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    // Re-acquire on page becoming visible if we still have consumers
    // (browsers auto-release on tab hide).
    if (document.visibilityState === 'visible' && consumers > 0 && !sentinel) {
      tryAcquire();
    }
  });
}

async function tryAcquire(): Promise<void> {
  if (sentinel || pendingAcquire) return;
  if (consumers === 0) return;
  const nav = navigator as Nav;
  if (!nav.wakeLock) return;
  pendingAcquire = true;
  try {
    const s = await nav.wakeLock.request('screen');
    sentinel = s;
    s.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // user gesture may not have happened, or permission denied — no-op
  } finally {
    pendingAcquire = false;
  }
}

async function maybeRelease(): Promise<void> {
  if (consumers > 0) return;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // no-op
  } finally {
    sentinel = null;
  }
}

export const wakelockRule: EnhanceRule = {
  name: 'wakelock',
  capabilities: ['wakelock'],
  apply: () => {
    consumers += 1;
    bindGestureOnce();
    // If a gesture has already happened (e.g. element added late after
    // user has scrolled), this still races the acquire correctly.
    void tryAcquire();
    return () => {
      consumers = Math.max(0, consumers - 1);
      void maybeRelease();
    };
  },
};
