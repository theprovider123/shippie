/**
 * Append-only event log with vector clocks.
 *
 * Use cases: chat, quiz answers, feed-style events. Cheaper than Yjs
 * because we don't need character-level conflict resolution — only
 * causal ordering and last-write-wins per key.
 *
 * Conflict-resolution rules:
 *   - Order: causal (per vector clock), then ts, then author id.
 *   - LWW per `key`: only the latest entry per key surfaces from
 *     `latestByKey()`. Earlier entries are still in the raw log.
 *
 * Wire format is application's responsibility — `append()` returns the
 * serializable LogEntry and the caller pipes it through `encryption.ts`.
 */
import type { LogEntry, PeerId, VectorClock } from './types.ts';

export interface EventLogOptions {
  selfId: PeerId;
}

export class EventLog<T = unknown> {
  readonly selfId: PeerId;
  private clock: VectorClock = {};
  private entries = new Map<string, LogEntry<T>>();
  private listeners = new Set<(entry: LogEntry<T>) => void>();

  constructor(opts: EventLogOptions) {
    this.selfId = opts.selfId;
    this.clock[this.selfId] = 0;
  }

  /** Local append — produces an entry to broadcast to peers. */
  append(data: T, opts: { key?: string } = {}): LogEntry<T> {
    this.clock[this.selfId] = (this.clock[this.selfId] ?? 0) + 1;
    const entry: LogEntry<T> = {
      id: makeId(),
      author: this.selfId,
      ts: Date.now(),
      clock: { ...this.clock },
      data,
    };
    if (opts.key !== undefined) entry.key = opts.key;
    this.entries.set(entry.id, entry);
    this.fire(entry);
    return entry;
  }

  /** Receive an entry from a peer. Idempotent — replaying is safe. */
  apply(entry: LogEntry<T>): boolean {
    if (this.entries.has(entry.id)) return false;
    if (!entry.author || typeof entry.ts !== 'number') {
      throw new Error('eventlog: invalid entry');
    }
    // Merge clock: max(self, theirs) per peer.
    for (const peer of Object.keys(entry.clock)) {
      const next = entry.clock[peer]!;
      const existing = this.clock[peer] ?? 0;
      if (next > existing) this.clock[peer] = next;
    }
    this.entries.set(entry.id, entry);
    this.fire(entry);
    return true;
  }

  /** All entries in causal order. */
  all(): LogEntry<T>[] {
    return [...this.entries.values()].sort(compareEntries);
  }

  /** Latest entry per key (LWW). Entries without a key are ignored. */
  latestByKey(): Map<string, LogEntry<T>> {
    const out = new Map<string, LogEntry<T>>();
    for (const e of this.all()) {
      if (e.key === undefined) continue;
      // Because all() is sorted ascending, later iterations win.
      out.set(e.key, e);
    }
    return out;
  }

  /** Snapshot of the local clock. Useful for resync handshakes. */
  snapshotClock(): VectorClock {
    return { ...this.clock };
  }

  /** Subscribe to all new entries (local + applied). */
  onEntry(handler: (entry: LogEntry<T>) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private fire(entry: LogEntry<T>) {
    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch {
        // Swallow listener errors to keep the log consistent.
      }
    }
  }
}

/**
 * Causal compare — `a` happens-before `b` ⇒ -1; concurrent ⇒ break by
 * ts then author id.
 */
export function compareEntries(a: LogEntry, b: LogEntry): number {
  const cmp = compareClocks(a.clock, b.clock);
  if (cmp !== 0) return cmp;
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.author !== b.author) return a.author < b.author ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/**
 * Returns -1 if `a < b` (a happens-before b), 1 if `a > b`, 0 if equal
 * or concurrent (caller breaks the tie with ts).
 */
export function compareClocks(a: VectorClock, b: VectorClock): number {
  let aLeq = true;
  let bLeq = true;
  const peers = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const p of peers) {
    const av = a[p] ?? 0;
    const bv = b[p] ?? 0;
    if (av > bv) bLeq = false;
    else if (bv > av) aLeq = false;
  }
  if (aLeq && bLeq) return 0; // equal
  if (aLeq) return -1;
  if (bLeq) return 1;
  return 0; // concurrent
}

function makeId(): string {
  // 16 random hex chars — collision-free enough for a single-room log.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < buf.length; i++) s += buf[i]!.toString(16).padStart(2, '0');
  return s;
}
