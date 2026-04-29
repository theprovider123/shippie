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
