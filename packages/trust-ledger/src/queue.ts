/**
 * Pre-init in-memory queue.
 *
 * On first launch the ledger DB and the device key both take a tick to
 * become ready. Capability calls arriving in that window are queued
 * here (bounded) and flushed in arrival order once init completes.
 *
 * Cap and timeout are spec-frozen (256 entries, 30s) but injectable
 * for tests.
 */

import type { LedgerRow } from './types.ts';

export interface PreInitQueueOptions {
  capN?: number;
  timeoutTms?: number;
  now?: () => number;
}

export interface QueuedEntry {
  enqueuedAt: number;
  row: LedgerRow;
}

export interface EnqueueResult {
  accepted: boolean;
  reason?: 'queue-full' | 'queue-expired';
}

export interface PreInitQueue {
  enqueue(row: LedgerRow): EnqueueResult;
  drain(): QueuedEntry[];
  size(): number;
  expireOlderThan(cutoffMs: number): number;
}

export function createPreInitQueue(opts: PreInitQueueOptions = {}): PreInitQueue {
  const capN = opts.capN ?? 256;
  const timeoutTms = opts.timeoutTms ?? 30_000;
  const now = opts.now ?? Date.now;
  const entries: QueuedEntry[] = [];

  return {
    enqueue(row: LedgerRow): EnqueueResult {
      const t = now();
      // Drop stale entries opportunistically.
      while (entries.length > 0 && t - entries[0]!.enqueuedAt > timeoutTms) {
        entries.shift();
      }
      if (entries.length >= capN) {
        return { accepted: false, reason: 'queue-full' };
      }
      entries.push({ enqueuedAt: t, row });
      return { accepted: true };
    },

    drain(): QueuedEntry[] {
      const out = entries.splice(0, entries.length);
      return out;
    },

    size(): number {
      return entries.length;
    },

    expireOlderThan(cutoffMs: number): number {
      let removed = 0;
      while (entries.length > 0 && entries[0]!.enqueuedAt < cutoffMs) {
        entries.shift();
        removed++;
      }
      return removed;
    },
  };
}
