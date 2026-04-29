/**
 * P1B — AI model cache budget with LRU eviction.
 *
 * Why this exists: the plan's quantized model footprint (~225 MB across
 * the 6 showcases that actually run local AI) sits inside iOS Safari's
 * Cache Storage eviction limits. iOS aggressively reaps caches under
 * pressure, so a passive cache without a budget can silently drop
 * recently-used models mid-session. This module enforces an explicit
 * budget the container manages itself: when adding a new model would
 * push us over, evict least-recently-used entries first.
 *
 * The module is pure data — no Cache Storage I/O. The container's
 * worker boot wires the actual `caches.open(...)` reads + deletes to
 * the eviction plan this returns. That keeps the LRU logic testable
 * without a DOM and makes the eviction strategy auditable.
 */

/** A single tracked cache entry — one model's bytes worth in storage. */
export interface CacheEntry {
  /** Cache key, usually the model id (e.g. `Xenova/all-MiniLM-L6-v2`). */
  key: string;
  /** Bytes the model occupies. Quantized variants run ~22-95 MB each. */
  bytes: number;
  /** Wall-clock ms when this entry was last touched. */
  lastUsedAt: number;
}

export interface CacheBudgetOptions {
  /**
   * Hard cap on total bytes tracked by the budget. Default 225 MB,
   * matching the plan's q8 footprint for all 6 showcases.
   */
  maxBytes?: number;
  /**
   * Wall-clock supplier; tests inject a deterministic value.
   */
  now?: () => number;
}

export interface CacheBudget {
  /** Total bytes currently tracked. */
  totalBytes(): number;
  /** Max bytes this budget allows. */
  maxBytes(): number;
  /** Snapshot of current entries, oldest first by lastUsedAt. */
  entries(): readonly CacheEntry[];
  /**
   * Returns the keys to evict so that `incomingBytes` would fit. Empty
   * array means we already have headroom. Always evicts in LRU order.
   * Does not mutate state — call `delete()` for each evicted key.
   */
  planEviction(incomingBytes: number): string[];
  /** Mark an entry used now. No-op if key is unknown. */
  touch(key: string): void;
  /**
   * Add or overwrite an entry. Trips an error if `bytes` alone exceeds
   * `maxBytes` — that means the model is too big to ever fit and the
   * caller should fall through to the edge instead of evicting
   * everything trying to seat it.
   */
  put(key: string, bytes: number): void;
  /** Remove an entry. Idempotent on unknown keys. */
  delete(key: string): void;
  /** Drop everything — used when the user clears the AI cache by hand. */
  clear(): void;
}

/** Budget default: 225 MB. The plan's q8 envelope across all showcases. */
export const DEFAULT_AI_CACHE_BUDGET_BYTES = 225 * 1024 * 1024;

export function createAiCacheBudget(options: CacheBudgetOptions = {}): CacheBudget {
  const max = options.maxBytes ?? DEFAULT_AI_CACHE_BUDGET_BYTES;
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, CacheEntry>();

  function totalBytes(): number {
    let total = 0;
    for (const entry of entries.values()) total += entry.bytes;
    return total;
  }

  function sortedByLru(): CacheEntry[] {
    return [...entries.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  }

  return {
    totalBytes,
    maxBytes: () => max,
    entries: () => sortedByLru(),
    planEviction(incomingBytes) {
      if (incomingBytes <= 0) return [];
      const sorted = sortedByLru();
      const evicted: string[] = [];
      let total = totalBytes();
      while (total + incomingBytes > max && sorted.length > 0) {
        const victim = sorted.shift()!;
        evicted.push(victim.key);
        total -= victim.bytes;
      }
      return evicted;
    },
    touch(key) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.lastUsedAt = now();
    },
    put(key, bytes) {
      if (bytes > max) {
        throw new Error(
          `model bytes (${bytes}) exceed cache budget (${max}); cannot fit any number of models`,
        );
      }
      entries.set(key, { key, bytes, lastUsedAt: now() });
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}
