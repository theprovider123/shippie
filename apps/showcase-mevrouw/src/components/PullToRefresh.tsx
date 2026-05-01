/**
 * PullToRefresh — touch-driven pull gesture on the document scroll.
 *
 * When the user is at the top of the page and pulls down, a small
 * indicator slides down. Past a threshold + release → fires onRefresh
 * (which calls relay.resync() in mevrouw). Below threshold → snaps
 * back. Works inside an installed iOS PWA (standalone mode has no
 * built-in pull-to-refresh).
 *
 * Listens at the document level rather than wrapping a specific div,
 * so it works regardless of which page/tab the user is on.
 */
import { useEffect, useState } from 'react';

const TRIGGER_PX = 80;
const MAX_PULL_PX = 120;

interface Props {
  onRefresh: () => void | Promise<void>;
  /** Disable when the underlying state isn't ready (e.g. unpaired). */
  disabled?: boolean;
}

export function PullToRefresh({ onRefresh, disabled = false }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (disabled) return;

    let startY: number | null = null;
    let currentPull = 0;

    function isAtTop(): boolean {
      return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshing) return;
      if (!isAtTop()) {
        startY = null;
        return;
      }
      startY = e.touches[0]?.clientY ?? null;
      currentPull = 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY == null || refreshing) return;
      const y = e.touches[0]?.clientY ?? startY;
      const dy = y - startY;
      if (dy <= 0) {
        // user is scrolling up; don't interfere
        if (currentPull > 0) {
          currentPull = 0;
          setPull(0);
        }
        return;
      }
      // resistance: half the raw delta, capped
      const resisted = Math.min(MAX_PULL_PX, dy * 0.5);
      currentPull = resisted;
      setPull(resisted);
      if (resisted > 4 && e.cancelable) {
        // Prevent native overscroll bounce while we're handling the gesture
        e.preventDefault();
      }
    }

    async function onTouchEnd() {
      if (startY == null) return;
      const triggered = currentPull >= TRIGGER_PX;
      startY = null;
      if (triggered) {
        setRefreshing(true);
        setPull(TRIGGER_PX);
        try {
          await onRefresh();
        } finally {
          setTimeout(() => {
            setRefreshing(false);
            setPull(0);
            currentPull = 0;
          }, 600);
        }
      } else {
        currentPull = 0;
        setPull(0);
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh, disabled, refreshing]);

  if (pull <= 0 && !refreshing) return null;

  const label = refreshing
    ? 'Syncing…'
    : pull >= TRIGGER_PX
      ? 'Release to sync'
      : 'Pull to sync';

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center pointer-events-none overflow-hidden"
      style={{
        height: `${pull}px`,
        transition: refreshing ? 'none' : 'height 180ms ease-out',
      }}
      aria-hidden
    >
      <p className="pb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-foreground)] bg-[var(--background)]/80 backdrop-blur-sm px-3 py-1 rounded-full">
        {label}
      </p>
    </div>
  );
}
