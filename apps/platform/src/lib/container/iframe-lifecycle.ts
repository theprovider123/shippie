/**
 * P1A.6 (unification plan, follow-up) — iframe LRU eviction.
 *
 * The unification plan keeps apps mounted as iframes for instant
 * switching. Without a cap, a heavy user could end up with 30+
 * iframes alive simultaneously — every one carrying its own bridge
 * host, IndexedDB connections, network state, and JS heap. That's
 * cheap on desktop, painful on a 6.7" phone.
 *
 * This module is the cap. Pure data — given the current open list +
 * a focus event, return the next list (with at most `MAX_MOUNTED`
 * apps) and the slug to evict, if any. The container shell calls
 * this on every focus and disposes the evicted app's bridge host +
 * frame source.
 *
 * Default cap: 8 apps. Configurable per call. The cap counts active
 * + hidden mounts; the most-recently-focused stays first.
 */

export const DEFAULT_MAX_MOUNTED = 8;

export interface LruDecision<T = string> {
  /** New ordered list, most-recently-focused first. */
  openAppIds: readonly T[];
  /** App id to evict, or null if no eviction needed. */
  evicted: T | null;
}

/**
 * Apply a focus event to the open-app list. Returns:
 *   - the new ordered list (focused first, eviction applied)
 *   - the id evicted (or null if no eviction was necessary)
 *
 * Pure: no I/O, no mutation of inputs. Tests drive it deterministic-
 * ally.
 */
export function focusApp<T>(
  openAppIds: readonly T[],
  focused: T,
  max: number = DEFAULT_MAX_MOUNTED,
): LruDecision<T> {
  const filtered = openAppIds.filter((id) => id !== focused);
  const next = [focused, ...filtered];
  if (next.length <= max) {
    return { openAppIds: next, evicted: null };
  }
  // Evict the oldest entry — the last one in the recency-ordered list.
  const evicted = next[next.length - 1] ?? null;
  return {
    openAppIds: next.slice(0, max),
    evicted,
  };
}

/**
 * Unfocus an app (e.g., user goes back to the dashboard). The list
 * stays in the same order — only the activeAppId changes upstream.
 * No eviction here; this exists so callers don't have to reason
 * about whether `goHome` should reorder anything.
 */
export function unfocusApp<T>(openAppIds: readonly T[]): LruDecision<T> {
  return { openAppIds: [...openAppIds], evicted: null };
}

/**
 * Pending evictions — keyed by the *new* focused app id, valued by the
 * app id whose iframe + bridge host should be disposed once the new
 * one is ready. Held off until the new frame fires markFrameReady or
 * markFrameError so we don't destroy a still-booting iframe under a
 * rapid-click sequence (the bug that produced "click did nothing"
 * reports).
 *
 * Pure data structure — callers operate on it via queue/consume.
 */
export type PendingEvictions<T = string> = ReadonlyMap<T, T>;

/**
 * Queue an eviction to fire when `focused`'s frame becomes ready.
 * If `evicted` is null, returns `pending` unchanged. If `focused`
 * already had a queued eviction, the old one is replaced and returned
 * as `superseded` so the caller can dispose it immediately (the
 * previously-pending app is no longer the one that's about to
 * disappear behind a fresh focus).
 */
export function queueEviction<T>(
  pending: PendingEvictions<T>,
  focused: T,
  evicted: T | null,
): { next: PendingEvictions<T>; superseded: T | null } {
  if (evicted === null) {
    return { next: pending, superseded: null };
  }
  const superseded = pending.get(focused) ?? null;
  const next = new Map(pending);
  next.set(focused, evicted);
  return { next, superseded };
}

/**
 * Consume the pending eviction for `settled` (the app that just hit
 * `ready` or `error`). Returns the evicted id (caller disposes) and
 * the new pending map without that entry.
 */
export function consumeEviction<T>(
  pending: PendingEvictions<T>,
  settled: T,
): { next: PendingEvictions<T>; evicted: T | null } {
  const evicted = pending.get(settled) ?? null;
  if (evicted === null) {
    return { next: pending, evicted: null };
  }
  const next = new Map(pending);
  next.delete(settled);
  return { next, evicted };
}
