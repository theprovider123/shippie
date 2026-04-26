/**
 * Wrapper proof emitter — POSTs runtime evidence to `/api/v1/proof` so
 * the platform can derive Capability Proof Badges from real device usage.
 *
 * Design constraints:
 *   - Privacy: the device hash is opaque, generated client-side from a
 *     random byte sequence stored in localStorage. We never send a user
 *     identifier; the platform never joins this hash to any user table.
 *     If a user clears storage, they become a new "device" — that's
 *     acceptable for a "≥N distinct devices" threshold.
 *   - Reliability: events queue in IndexedDB so a dropped network or
 *     a closed tab doesn't lose evidence. The queue flushes on a 30s
 *     interval, on `visibilitychange` (pushed before unload), and on
 *     idle (`requestIdleCallback` when available).
 *   - Cost: one POST per flush carries up to 16 events (the platform's
 *     batch limit). The emitter coalesces duplicates within a session
 *     so 200 `local_db_used` events become 1 entry per type per flush.
 *   - Failure: 4xx responses drop the batch (the events are malformed
 *     or the app slug doesn't resolve — re-trying won't help). 5xx and
 *     network errors keep the events queued and retry on the next flush.
 *
 * Public API:
 *   import { emitProofEvent } from '@shippie/sdk/wrapper';
 *   emitProofEvent('local_db_used');
 *   emitProofEvent('ai_ran_local', { task: 'classify' });
 *
 * Wired automatically:
 *   - `installed` on `window.addEventListener('appinstalled', …)`
 *   - `service_worker_active` once `navigator.serviceWorker.ready` resolves
 *   The rest are emitted by the subsystem that owns the event (local-db,
 *   local-ai, proximity, your-data-panel, etc.).
 */

const DEVICE_HASH_KEY = 'shippie:device-hash:v1';
const QUEUE_DB = 'shippie-proof-queue';
const QUEUE_STORE = 'pending';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH = 16;
const MIN_DEVICE_HASH_LENGTH = 16;
const PROOF_ENDPOINT = '/api/v1/proof';

export type ProofEventType =
  | 'installed'
  | 'service_worker_active'
  | 'offline_loaded'
  | 'local_db_used'
  | 'data_exported'
  | 'ai_ran_local'
  | 'model_cached'
  | 'room_joined'
  | 'peer_synced'
  | 'backup_written'
  | 'backup_restored'
  | 'device_transferred'
  | 'permissions_scanned'
  | 'external_domains_shown'
  | 'permission_diff_surfaced'
  // App Kinds (docs/app-kinds.md). Emitted by the wrapper to upgrade or
  // demote `publicKindStatus`. Wrapper auto-emission lands in Phase 1b;
  // for now, surfaces that observe these conditions can call
  // `emitProofEvent('kind_local_launch_offline')` directly.
  | 'kind_local_launch_offline'
  | 'kind_local_write_local'
  | 'kind_local_workflow_offline'
  | 'kind_connected_graceful_degrade'
  | 'kind_leak_personal_data';

interface QueuedEvent {
  /** IndexedDB autoincrement key; assigned on put. */
  id?: number;
  eventType: ProofEventType;
  payload?: Record<string, unknown>;
  ts: number;
}

interface ProofConfig {
  /** App slug — usually `__shippie_meta.appSlug`. Required for the POST. */
  appSlug: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Override the endpoint origin (defaults to the page's origin). */
  endpointOrigin?: string;
  /** Override the flush interval (tests). */
  flushIntervalMs?: number;
}

let config: ProofConfig | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let memoryQueue: QueuedEvent[] = []; // pre-IDB / fallback when storage is unavailable
let dedupKey = new Set<string>(); // session-scoped coalescer

/**
 * Bootstrap. Idempotent — calling configure twice updates the slug
 * without resetting the queue.
 */
export function configureProof(opts: ProofConfig): void {
  config = opts;
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushNow();
  });
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(
    () => void flushNow(),
    opts.flushIntervalMs ?? FLUSH_INTERVAL_MS,
  );
  // Emit auto-events on first configure.
  void autoEmitInstall();
  void autoEmitServiceWorker();
}

export function emitProofEvent(
  eventType: ProofEventType,
  payload?: Record<string, unknown>,
): void {
  // Session-level coalescer: one event of each (type|payloadHash)
  // per flush window.
  const key = payloadHash(eventType, payload);
  if (dedupKey.has(key)) return;
  dedupKey.add(key);
  const event: QueuedEvent = { eventType, payload, ts: Date.now() };
  if (typeof indexedDB === 'undefined') {
    // Synchronous fallback — tests + non-browser environments. Keeping
    // the push synchronous matters: callers `emit(); flush()` back-to-back
    // expect the just-emitted event to be in the queue.
    memoryQueue.push(event);
  } else {
    void enqueueIdb(event);
  }
}

/** Force a flush. Returns the number of events sent. */
export async function flushNow(): Promise<number> {
  if (!config?.appSlug) return 0;
  const events = await drainQueue(MAX_BATCH);
  if (events.length === 0) return 0;
  const deviceHash = await getDeviceHash();
  const fetchFn = config.fetchImpl ?? globalThis.fetch;
  const origin = config.endpointOrigin ?? '';
  try {
    const res = await fetchFn(`${origin}${PROOF_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appSlug: config.appSlug,
        deviceHash,
        events: events.map((e) => ({ eventType: e.eventType, payload: e.payload })),
      }),
    });
    if (res.status >= 500) {
      // Transient — re-queue.
      for (const e of events) reenqueue(e);
      return 0;
    }
    if (!res.ok) {
      // 4xx — malformed or app missing; drop.
      return 0;
    }
    // Reset dedup on successful flush so the next interval can re-emit
    // the same events from a fresh observation cycle.
    dedupKey = new Set();
    return events.length;
  } catch {
    for (const e of events) reenqueue(e);
    return 0;
  }
}

/** Reset state — exposed for tests only. */
export function _resetProofForTests(): void {
  config = null;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  memoryQueue = [];
  dedupKey = new Set();
  cachedDeviceHash = null;
}

// ---------------------------------------------------------------------------
// Storage layer (IndexedDB with in-memory fallback)
// ---------------------------------------------------------------------------

async function openQueueDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function enqueueIdb(event: QueuedEvent): Promise<void> {
  const db = await openQueueDb();
  if (!db) {
    memoryQueue.push(event);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

/** Used by `flushNow` on the retry path — re-queues without dedup. */
function reenqueue(event: QueuedEvent): void {
  if (typeof indexedDB === 'undefined') {
    memoryQueue.push(event);
  } else {
    void enqueueIdb(event);
  }
}

async function drainQueue(max: number): Promise<QueuedEvent[]> {
  if (memoryQueue.length > 0) {
    const drained = memoryQueue.splice(0, max);
    return drained;
  }
  const db = await openQueueDb();
  if (!db) return [];
  return new Promise<QueuedEvent[]>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.getAll(undefined, max);
    req.onsuccess = () => {
      const events = (req.result as QueuedEvent[]) ?? [];
      // Delete the entries we're returning.
      for (const ev of events) {
        if (ev.id !== undefined) store.delete(ev.id);
      }
      tx.oncomplete = () => {
        db.close();
        resolve(events);
      };
    };
    req.onerror = () => {
      db.close();
      resolve([]);
    };
  });
}

// ---------------------------------------------------------------------------
// Device hash — opaque, persistent, never a user identifier
// ---------------------------------------------------------------------------

// Module-scope cache. Browsers prefer the localStorage value (survives
// reloads); Node-like test environments without localStorage fall back
// to this in-memory cache so the hash stays stable across calls in the
// same process.
let cachedDeviceHash: string | null = null;

async function getDeviceHash(): Promise<string> {
  if (cachedDeviceHash !== null) return cachedDeviceHash;
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(DEVICE_HASH_KEY);
      if (cached && cached.length >= MIN_DEVICE_HASH_LENGTH) {
        cachedDeviceHash = cached;
        return cached;
      }
    } catch {
      /* private mode or hostile shim — fall through to generation */
    }
  }
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hash = bytesToHex(bytes);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DEVICE_HASH_KEY, hash);
    } catch {
      // Storage may throw in private mode; ephemeral hash is acceptable.
    }
  }
  cachedDeviceHash = hash;
  return hash;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function payloadHash(type: string, payload: Record<string, unknown> | undefined): string {
  if (!payload) return type;
  // Stable JSON for shallow payloads — sufficient for de-dupe within a
  // single session window.
  const keys = Object.keys(payload).sort();
  const parts: string[] = [];
  for (const k of keys) parts.push(`${k}=${String(payload[k])}`);
  return `${type}|${parts.join(';')}`;
}

// ---------------------------------------------------------------------------
// Auto-emit hooks
// ---------------------------------------------------------------------------

async function autoEmitInstall(): Promise<void> {
  if (typeof window === 'undefined') return;
  window.addEventListener('appinstalled', () => emitProofEvent('installed'), { once: true });
}

async function autoEmitServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  try {
    await navigator.serviceWorker.ready;
    emitProofEvent('service_worker_active');
  } catch {
    // SW unavailable — silent.
  }
}
