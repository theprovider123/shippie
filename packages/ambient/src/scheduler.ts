/**
 * Scheduler for ambient intelligence.
 *
 * Two execution paths, picked by environment:
 *
 *  - Service worker (Chrome installed PWA): register Periodic Background
 *    Sync via `self.registration.periodicSync.register(tag, { minInterval })`.
 *    NotAllowedError (browser denied permission) falls through gracefully —
 *    the document-side fallback still runs the next time a tab is open.
 *
 *  - Document (Safari + everywhere else): listen for `visibilitychange`.
 *    When the page becomes visible AND > intervalMs has elapsed since the
 *    last recorded run, fire `fallback()` and persist a new timestamp.
 *
 * Storage choice: a SEPARATE small DB `shippie-ambient-scheduler` (v1) with
 * a single `meta` store. Keeps the existing `shippie-ambient` v1 schema
 * untouched — no upgrade migration needed for in-flight insights/queue
 * data, and the scheduler's bookkeeping has no reason to share a connection
 * with the orchestrator's stores.
 *
 * Returned `stop()` detaches the visibilitychange listener. (PBS
 * registration is idempotent and persists across reloads, so SW-side
 * teardown is intentionally a no-op — callers re-register on next boot.)
 */

const SCHEDULER_DB_NAME = 'shippie-ambient-scheduler';
const SCHEDULER_DB_VERSION = 1;
const META_STORE = 'meta';
const SWEEP_MARKERS_STORE = 'sweep-markers';

type GlobalLike = {
  registration?: {
    periodicSync?: {
      register: (tag: string, opts: { minInterval: number }) => Promise<void>;
    };
  };
};

type DocumentLike = {
  visibilityState?: string;
  addEventListener: (
    type: 'visibilitychange',
    listener: () => void | Promise<void>,
  ) => void;
  removeEventListener: (
    type: 'visibilitychange',
    listener: () => void | Promise<void>,
  ) => void;
};

export interface RegisterSchedulerOpts {
  tag: string;
  intervalMs: number;
  fallback: () => void | Promise<void>;
  /** Override clock for tests. */
  now?: () => number;
}

function getSelf(): GlobalLike | null {
  // `self` is defined in workers and in browsers, but only workers have
  // `self.registration`. Use `globalThis` to avoid a ReferenceError in
  // environments where `self` is not defined.
  const g = globalThis as unknown as { self?: GlobalLike };
  return g.self ?? null;
}

function getDocument(): DocumentLike | null {
  const g = globalThis as unknown as { document?: DocumentLike };
  return g.document ?? null;
}

function _openSchedulerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SCHEDULER_DB_NAME, SCHEDULER_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(SWEEP_MARKERS_STORE)) {
        db.createObjectStore(SWEEP_MARKERS_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _readLastRun(tag: string): Promise<number | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await _openSchedulerDb();
  try {
    return await new Promise<number | null>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(`lastRun:${tag}`);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === 'number' ? v : null);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function _writeLastRun(tag: string, ts: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await _openSchedulerDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const req = tx.objectStore(META_STORE).put(ts, `lastRun:${tag}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function _resetSchedulerDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(SCHEDULER_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Test helper: clear the scheduler's persisted timestamps. */
export async function _resetSchedulerForTest(): Promise<void> {
  await _resetSchedulerDb();
}

/**
 * Register the ambient scheduler. Returns a `stop()` that detaches any
 * document-side listeners; SW-side PBS registration persists across the
 * SW lifetime by design.
 */
export function registerScheduler(opts: RegisterSchedulerOpts): () => void {
  const { tag, intervalMs, fallback } = opts;
  const now = opts.now ?? (() => Date.now());

  const sw = getSelf();
  const swReg = sw?.registration;
  const periodicSync = swReg?.periodicSync;
  let registeredPbs = false;

  if (periodicSync && typeof periodicSync.register === 'function') {
    // Fire-and-forget. NotAllowedError (denied permission) is swallowed —
    // the visibilitychange path still picks up the slack on the document
    // side. Other errors are logged.
    Promise.resolve(
      periodicSync.register(tag, { minInterval: intervalMs }),
    ).then(
      () => {
        registeredPbs = true;
      },
      (err: unknown) => {
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: unknown }).name)
            : '';
        if (name !== 'NotAllowedError') {
          // Surface unexpected failures, but never throw.
          // eslint-disable-next-line no-console
          console.warn('[ambient/scheduler] periodicSync.register failed', err);
        }
      },
    );
  }

  const doc = getDocument();
  let listener: (() => void | Promise<void>) | null = null;

  if (doc && typeof doc.addEventListener === 'function') {
    listener = async () => {
      if (doc.visibilityState && doc.visibilityState !== 'visible') return;
      const t = now();
      const last = await _readLastRun(tag);
      if (last !== null && t - last < intervalMs) return;
      try {
        await fallback();
      } finally {
        await _writeLastRun(tag, t);
      }
    };
    doc.addEventListener('visibilitychange', listener);
  }

  return function stop() {
    if (doc && listener && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('visibilitychange', listener);
      listener = null;
    }
    // Touch `registeredPbs` so the variable is observably used; intentional
    // no-op — PBS registrations are idempotent and survive page reloads.
    void registeredPbs;
  };
}
