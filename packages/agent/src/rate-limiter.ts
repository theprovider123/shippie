/**
 * Rate limiter for agent actions. Keeps the agent from spamming
 * insights in tight loops or on rapid wakes. The audit log persists
 * actions; this in-memory limiter is the lightweight first line.
 */

export interface RateLimitOptions {
  /** Max actions allowed in the window. */
  maxActions: number;
  /** Window length in ms. */
  windowMs: number;
}

export interface RateLimiter {
  /** Returns true and records, or false (rate-limited). */
  tryAcquire(now: number): boolean;
  /** How many actions have happened in the active window. */
  size(now: number): number;
  /** Reset internal state. */
  reset(): void;
}

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  let stamps: number[] = [];
  return {
    tryAcquire(now: number): boolean {
      stamps = stamps.filter((t) => now - t < opts.windowMs);
      if (stamps.length >= opts.maxActions) return false;
      stamps.push(now);
      return true;
    },
    size(now: number): number {
      stamps = stamps.filter((t) => now - t < opts.windowMs);
      return stamps.length;
    },
    reset() {
      stamps = [];
    },
  };
}
