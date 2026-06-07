import type {
  EnqueueInput,
  FlushResult,
  Outbox,
  OutboxEntry,
  OutboxStatus,
  OutboxStore,
  WorkspaceEvent,
} from '@shippie/cloudlet-contract';

/**
 * Outbox — the client-side heart of the offline sync engine (Phase 4).
 *
 * Reusable across future Shippie private apps. The durable queue lives behind
 * the {@link OutboxStore} interface so this whole class is unit-testable in
 * Node with a fake store (mirrors the `SqlExecutor`/`WorkspaceStore` pattern) —
 * the browser binds it to IndexedDB (`idb-outbox-store.ts`).
 *
 * Guarantees:
 *  - `enqueue` stamps a uuid `clientEventId`, the persisted per-device
 *    `deviceId`, `createdOfflineAt` (client clock), and `schemaVersion`, then
 *    writes the event to durable storage BEFORE returning — so a crash/reload
 *    never loses a captured event.
 *  - `flush` POSTs every DUE entry; the server dedupes by `clientEventId`, so
 *    replaying a partially-sent batch is safe. Accepted/duplicate entries are
 *    removed; failures stay queued with exponential backoff.
 *  - status() is 'syncing' during a flush, 'synced' when the queue is empty,
 *    else 'offline' (work saved locally, awaiting connectivity).
 */

const DEVICE_ID_META = 'deviceId';
const KEY_PREFIX = 'evt:';

export interface OutboxDeps {
  store: OutboxStore;
  /** POST one event to the events API. Resolves to the server's verdict. */
  send: (event: WorkspaceEvent) => Promise<SendResult>;
  /** Current authenticated user id (becomes `actorUserId`). */
  actorUserId: string;
  /** Per-device schema version stamp (the app's current event schema). */
  schemaVersion: number;
  /** Injected for determinism in tests. Defaults to wall clock. */
  now?: () => number;
  /** Injected for determinism in tests. Defaults to crypto.randomUUID. */
  uuid?: () => string;
  /** Backoff base in ms (attempt N waits base * 2^(N-1), capped). */
  backoffBaseMs?: number;
  backoffCapMs?: number;
}

/** Server verdict for one POSTed event. */
export type SendResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; retryable: boolean };

const DEFAULT_BACKOFF_BASE = 2_000;
const DEFAULT_BACKOFF_CAP = 5 * 60_000;

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Deterministic-shape fallback (non-browser, no Web Crypto).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class OutboxImpl implements Outbox {
  private readonly store: OutboxStore;
  private readonly send: OutboxDeps['send'];
  private readonly actorUserId: string;
  private readonly schemaVersion: number;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;

  private cachedDeviceId: string | null = null;
  private flushing = false;
  /** Last-known coarse status, for the synchronous `status()` getter. */
  private lastStatus: OutboxStatus = 'synced';

  constructor(deps: OutboxDeps) {
    this.store = deps.store;
    this.send = deps.send;
    this.actorUserId = deps.actorUserId;
    this.schemaVersion = deps.schemaVersion;
    this.now = deps.now ?? (() => Date.now());
    this.uuid = deps.uuid ?? randomUuid;
    this.backoffBaseMs = deps.backoffBaseMs ?? DEFAULT_BACKOFF_BASE;
    this.backoffCapMs = deps.backoffCapMs ?? DEFAULT_BACKOFF_CAP;
  }

  /** Stable per-device id, persisted on first use. */
  async deviceId(): Promise<string> {
    if (this.cachedDeviceId) return this.cachedDeviceId;
    let id = await this.store.getMeta(DEVICE_ID_META);
    if (!id) {
      id = `dev-${this.uuid()}`;
      await this.store.setMeta(DEVICE_ID_META, id);
    }
    this.cachedDeviceId = id;
    return id;
  }

  async enqueue(input: EnqueueInput): Promise<WorkspaceEvent> {
    const ts = this.now();
    const event: WorkspaceEvent = {
      clientEventId: this.uuid(),
      type: input.type,
      instanceId: input.instanceId,
      actorUserId: input.actorUserId ?? this.actorUserId,
      deviceId: await this.deviceId(),
      createdOfflineAt: new Date(ts).toISOString(),
      schemaVersion: input.schemaVersion ?? this.schemaVersion,
      payload: input.payload,
    };
    const entry: OutboxEntry = {
      event,
      attempts: 0,
      enqueuedAt: ts,
      nextAttemptAt: 0, // due immediately
    };
    await this.store.put(KEY_PREFIX + event.clientEventId, entry);
    return event;
  }

  async pendingCount(): Promise<number> {
    return (await this.store.list()).length;
  }

  status(): OutboxStatus {
    return this.lastStatus;
  }

  private backoffFor(attempts: number): number {
    const ms = this.backoffBaseMs * 2 ** Math.max(0, attempts - 1);
    return Math.min(ms, this.backoffCapMs);
  }

  /**
   * Flush every DUE entry once. Idempotent against the server (dedupe on
   * `clientEventId`). Concurrency-guarded: a second concurrent flush returns a
   * no-op result rather than double-sending.
   */
  async flush(): Promise<FlushResult> {
    if (this.flushing) {
      return {
        attempted: 0,
        accepted: 0,
        duplicates: 0,
        failed: 0,
        pending: await this.pendingCount(),
      };
    }
    this.flushing = true;
    this.lastStatus = 'syncing';
    let attempted = 0;
    let accepted = 0;
    let duplicates = 0;
    let failed = 0;
    try {
      const entries = await this.store.list();
      const due = entries.filter(({ value }) => value.nextAttemptAt <= this.now());
      for (const { key, value } of due) {
        attempted += 1;
        let result: SendResult;
        try {
          result = await this.send(value.event);
        } catch {
          result = { ok: false, retryable: true };
        }
        if (result.ok) {
          if (result.duplicate) duplicates += 1;
          else accepted += 1;
          await this.store.delete(key);
        } else if (!result.retryable) {
          // Non-retryable (e.g. 400 malformed) — drop it; keeping it would wedge
          // the queue forever. Counted as failed for surfacing.
          failed += 1;
          await this.store.delete(key);
        } else {
          failed += 1;
          const attempts = value.attempts + 1;
          await this.store.put(key, {
            ...value,
            attempts,
            nextAttemptAt: this.now() + this.backoffFor(attempts),
          });
        }
      }
    } finally {
      this.flushing = false;
      const pending = await this.pendingCount();
      this.lastStatus = pending === 0 ? 'synced' : 'offline';
    }
    return { attempted, accepted, duplicates, failed, pending: await this.pendingCount() };
  }
}
