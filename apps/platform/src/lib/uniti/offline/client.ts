import {
  createUpcasterRegistry,
  type UpcasterRegistry,
  type WorkspaceEvent,
} from '@shippie/cloudlet-contract';
import { OutboxImpl, type SendResult } from './outbox';
import { createIdbOutboxStore } from './idb-outbox-store';

/**
 * Browser-side OfflineSync client (Phase 4) for the Uniti teacher app.
 *
 * One Outbox per device (the queue is school-agnostic — each event carries its
 * own `instanceId`, so a single device serving one teacher is fine; the events
 * API resolves the boundary server-side). Wires:
 *   - the IndexedDB store (durable across reloads / offline),
 *   - `send` → `POST /api/cloudlet/instances/<slug>/events`,
 *   - the per-app schema version + upcaster registry,
 *   - Background Sync registration + online/interval fallback (see register()).
 *
 * The current per-app event schema version. Bump when an event payload shape
 * changes, and register an upcaster (below) so devices offline across the bump
 * still replay. The server/DO upcasts on read; the client stamps this version.
 */
export const UNITI_EVENT_SCHEMA_VERSION = 1;

/** The Background Sync tag the SW listens for. */
export const UNITI_SYNC_TAG = 'uniti-outbox-flush';

/**
 * Per-app upcaster registry. Register steps here as the schema evolves, e.g.:
 *   upcasters.registerUpcaster('feedback.created', 1, (e) => ({
 *     ...e, schemaVersion: 2, payload: { ...e.payload, confidence: 3 } }));
 * Shared shape with the server so a device replaying old events and the DO
 * reading them agree. Empty at v1 (nothing to upcast yet).
 */
export const upcasters: UpcasterRegistry = createUpcasterRegistry();

type Listener = () => void;

/** Resolve the events API path for a school slug. */
function eventsUrl(slug: string): string {
  return `/api/cloudlet/instances/${encodeURIComponent(slug)}/events`;
}

/**
 * The slug a queued event targets is not on the WorkspaceEvent (it carries the
 * immutable instanceId, set server-side). For the teacher app a device serves
 * one school at a time, so we hold the active slug on the client and POST there.
 * Multi-school devices would key the queue by slug — deferred (single-school
 * teacher use is the Phase 4 target).
 */
class UnitiOfflineClient {
  private outbox: OutboxImpl;
  private activeSlug: string;
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private wired = false;

  constructor(actorUserId: string, slug: string) {
    this.activeSlug = slug;
    const send = async (event: WorkspaceEvent): Promise<SendResult> => {
      // Upcast to the current schema before send (a device that captured under
      // an older app version replays its old events upgraded).
      const upcast = upcasters.upcast(event, UNITI_EVENT_SCHEMA_VERSION);
      try {
        const res = await fetch(eventsUrl(this.activeSlug), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(upcast),
        });
        if (res.status === 201) return { ok: true, duplicate: false };
        if (res.status === 200) return { ok: true, duplicate: true }; // server dedupe
        // 4xx that is not 401/429 = malformed/forbidden → non-retryable drop.
        if (res.status === 400 || res.status === 403)
          return { ok: false, retryable: false };
        return { ok: false, retryable: true }; // 401/429/5xx/offline → retry
      } catch {
        return { ok: false, retryable: true }; // network down — keep queued
      }
    };
    this.outbox = new OutboxImpl({
      store: createIdbOutboxStore(),
      send,
      actorUserId,
      schemaVersion: UNITI_EVENT_SCHEMA_VERSION,
    });
  }

  setSlug(slug: string) {
    this.activeSlug = slug;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  status() {
    return this.outbox.status();
  }
  pendingCount() {
    return this.outbox.pendingCount();
  }

  /** Enqueue an event then attempt an immediate flush (best-effort). */
  async capture(input: { type: string; instanceId: string; payload: unknown }) {
    await this.outbox.enqueue(input);
    this.emit();
    void this.flush();
  }

  async flush() {
    const r = await this.outbox.flush();
    this.emit();
    // Ask the SW to retry later if anything is still pending (Background Sync).
    if (r.pending > 0) void this.requestBackgroundSync();
    return r;
  }

  /**
   * Register Background Sync (where supported) so the SW flushes on reconnect
   * even if the tab is closed; always also wire the online-event + interval
   * fallback (Safari/iOS lack the Background Sync API).
   */
  async wire() {
    if (this.wired || typeof window === 'undefined') return;
    this.wired = true;

    // Fallback 1: flush when connectivity returns.
    window.addEventListener('online', () => void this.flush());
    // Fallback 2: flush when the tab becomes visible again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
    // Fallback 3: periodic drain while pending (cheap; clears itself).
    this.intervalId ??= setInterval(() => {
      void this.outbox.pendingCount().then((n) => {
        if (n > 0) void this.flush();
      });
    }, 30_000);

    // Primary: Background Sync registration (Chromium). Harmless where absent.
    await this.requestBackgroundSync();
    // The SW may message us when it has flushed in the background.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'uniti-sync-flushed') this.emit();
      });
    }

    // Drain anything captured in a previous (offline) session on boot.
    void this.flush();
  }

  private async requestBackgroundSync() {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      if (reg.sync) await reg.sync.register(UNITI_SYNC_TAG);
    } catch {
      /* Background Sync unsupported/blocked — the fallbacks cover it. */
    }
  }
}

let singleton: UnitiOfflineClient | null = null;

/**
 * Get (or lazily create) the device Outbox client. `actorUserId` + initial
 * `slug` come from the page's server load. Safe to call on every page; the
 * slug is updated if it changed.
 */
export function getOfflineClient(actorUserId: string, slug: string): UnitiOfflineClient {
  if (!singleton) {
    singleton = new UnitiOfflineClient(actorUserId, slug);
    void singleton.wire();
  } else {
    singleton.setSlug(slug);
  }
  return singleton;
}

export type { UnitiOfflineClient };
