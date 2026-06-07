import type { WorkspaceEvent } from './events';

/**
 * OfflineSync — the reusable contract for the append-only sync engine shared by
 * every Shippie private app (Phase 4). The CLIENT side is an {@link Outbox}
 * (IndexedDB-backed in the browser, fake-store-backed in tests); the SERVER
 * already dedupes by `clientEventId`, so flush is idempotent and replay-safe.
 *
 * This module is pure types + a pure upcaster registry — no IndexedDB, no DOM,
 * no Cloudflare primitives — so it lives in the reusable package and is shared
 * by both the in-app client SDK and the server/DO read path.
 */

/** What the SyncChip reflects. `pending` is derived from `pendingCount()`. */
export type OutboxStatus = 'offline' | 'syncing' | 'synced';

/** A queued, not-yet-acknowledged event plus local bookkeeping. */
export interface OutboxEntry {
  /** The event as it will be POSTed. `clientEventId` is the server dedupe key. */
  event: WorkspaceEvent;
  /** Number of failed flush attempts so far (drives backoff). */
  attempts: number;
  /** Local enqueue time (ms epoch) — ordering + diagnostics only. */
  enqueuedAt: number;
  /** Earliest ms epoch at which this entry may be retried (backoff gate). */
  nextAttemptAt: number;
}

/**
 * Client-side Outbox. Generates `clientEventId` (uuid) + persists `deviceId`
 * per device + stamps `createdOfflineAt`, enqueues to durable local storage,
 * and flushes to the events API relying on server dedupe.
 */
export interface Outbox {
  /**
   * Stamp + enqueue an event. The caller supplies the domain bits
   * (`type`, `payload`, and `instanceId` — the school the write targets);
   * the Outbox fills `clientEventId`, `deviceId`, `createdOfflineAt`,
   * `schemaVersion`, and `actorUserId`.
   */
  enqueue(input: EnqueueInput): Promise<WorkspaceEvent>;
  /** Attempt to POST every due queued event. Resolves when the pass finishes. */
  flush(): Promise<FlushResult>;
  /** How many events are still queued (un-acknowledged). */
  pendingCount(): Promise<number>;
  /** Coarse status for the SyncChip. */
  status(): OutboxStatus;
}

export interface EnqueueInput {
  type: string;
  instanceId: string;
  payload: unknown;
  /** Optional override; defaults to the Outbox's actor (current user). */
  actorUserId?: string;
  /** Optional override of the per-device schema version stamp. */
  schemaVersion?: number;
}

export interface FlushResult {
  attempted: number;
  accepted: number;
  /** Server-confirmed duplicates (already-applied) — also removed from queue. */
  duplicates: number;
  failed: number;
  /** Remaining queued after this pass. */
  pending: number;
}

/**
 * A tiny async key-value store the Outbox persists to. The browser binds this
 * to IndexedDB; tests bind an in-memory fake. This is the single seam that
 * keeps the queue/replay logic unit-testable in Node — mirrors the
 * `SqlExecutor`/`WorkspaceStore` pattern.
 */
export interface OutboxStore {
  get(key: string): Promise<OutboxEntry | undefined>;
  put(key: string, value: OutboxEntry): Promise<void>;
  delete(key: string): Promise<void>;
  /** All entries, oldest-enqueued first. */
  list(): Promise<Array<{ key: string; value: OutboxEntry }>>;
  /** A persisted scalar (used for the per-device id). */
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}

// ── Schema-version upcasters ───────────────────────────────────────────────
// A device offline across an app update may hold events stamped with an older
// `schemaVersion`. The server/DO upcasts on read (and the client may upcast
// before send) so old events still replay. Registry is pure + synchronous.

export type Upcaster = (event: WorkspaceEvent) => WorkspaceEvent;

export interface UpcasterRegistry {
  /** Register a step that upgrades `type` from `fromVersion` → `fromVersion + 1`. */
  registerUpcaster(type: string, fromVersion: number, fn: Upcaster): void;
  /** Apply every registered step in order until the event reaches `toVersion`. */
  upcast(event: WorkspaceEvent, toVersion: number): WorkspaceEvent;
}

/**
 * Create an in-memory upcaster registry. Steps chain by version: to upcast an
 * event of version N to version M (M > N), each registered (type, v) step for
 * v in [N, M) runs in order, bumping `schemaVersion` by one each time. Unknown
 * (type, version) pairs are a no-op passthrough (the field shape is unchanged),
 * so an event already at/above `toVersion` is returned untouched.
 */
export function createUpcasterRegistry(): UpcasterRegistry {
  // key = `${type}@${fromVersion}`
  const steps = new Map<string, Upcaster>();
  return {
    registerUpcaster(type, fromVersion, fn) {
      steps.set(`${type}@${fromVersion}`, fn);
    },
    upcast(event, toVersion) {
      let current = event;
      // Guard against a malformed loop with a generous cap.
      let guard = 0;
      while (current.schemaVersion < toVersion && guard < 1000) {
        guard += 1;
        const step = steps.get(`${current.type}@${current.schemaVersion}`);
        if (step) {
          const next = step(current);
          // A step MUST advance the version; if it doesn't, bump it so the
          // loop terminates (and the payload is treated as already-shaped).
          current =
            next.schemaVersion > current.schemaVersion
              ? next
              : { ...next, schemaVersion: current.schemaVersion + 1 };
        } else {
          // No registered transform for this (type, version): the shape is
          // unchanged across this bump, so just advance the stamp.
          current = { ...current, schemaVersion: current.schemaVersion + 1 };
        }
      }
      return current;
    },
  };
}
