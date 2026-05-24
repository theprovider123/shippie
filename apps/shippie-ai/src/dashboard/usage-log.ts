/**
 * IndexedDB-backed usage log.
 *
 * Stores one row per inference request — origin, task, ts, durationMs.
 * Inputs and results are NEVER stored; if you find yourself reaching for
 * `result` here, stop. The privacy footer on the dashboard ("All processing
 * runs on this device. No inference logs of input or output.") is load-
 * bearing and depends on this.
 *
 * The store is bounded — we cap at LOG_CAP rows and trim oldest on insert,
 * so long-running devices don't bloat OPFS.
 *
 * Per-task sampling: tasks listed in `TASK_SAMPLING_DEFAULTS` below default
 * to a sampling rate < 1.0 — we roll a random number and skip the insert
 * when `Math.random() > rate`. The stored row carries its sampling rate so
 * the dashboard can multiply counts back up (or annotate the row with
 * "1 in 10").
 */
import type { InferenceTask, UsageEntry } from '../types.ts';

const DB_NAME = 'shippie-ai';
const DB_VERSION = 1;
const STORE = 'usage';
const LOG_CAP = 5_000;

/**
 * Default sampling rates per inference task. Tasks not listed here are
 * logged at 1.0 (every call). Sentiment dominates because the journal
 * showcase runs it on every keystroke (~14/sec while typing); logging
 * 1-in-10 keeps IndexedDB bounded without losing the trend.
 *
 * Override per-call by passing an explicit `samplingRate` to `logUsage`.
 */
export const TASK_SAMPLING_DEFAULTS: Record<InferenceTask, number> = {
  classify: 1.0,
  embed: 1.0,
  sentiment: 0.1,
  moderate: 1.0,
  vision: 1.0,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byTs', 'ts');
        store.createIndex('byOrigin', 'origin');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
  return dbPromise;
}

export async function logUsage(entry: UsageEntry): Promise<void> {
  const rate = resolveSamplingRate(entry);
  // Roll the dice — drop rows that lose the sampling lottery. The
  // stored `samplingRate` lets the dashboard interpret a single row as
  // representative of (1/rate) real inferences.
  if (rate < 1 && Math.random() >= rate) return;
  const stored: UsageEntry = rate === 1 ? entry : { ...entry, samplingRate: rate };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('add failed'));
  });
  // Cheap cap enforcement — every ~100 inserts, prune.
  if (Math.random() < 0.01) await prune().catch(() => {});
}

/**
 * Per-call sampling rate resolution. Explicit `entry.samplingRate`
 * wins; otherwise fall back to the per-task default. Out-of-range
 * values are clamped to [0, 1].
 */
export function resolveSamplingRate(entry: UsageEntry): number {
  const raw = entry.samplingRate ?? TASK_SAMPLING_DEFAULTS[entry.task] ?? 1;
  if (!Number.isFinite(raw)) return 1;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

export async function listUsage(): Promise<UsageEntry[]> {
  const db = await openDb();
  return new Promise<UsageEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as UsageEntry[]);
    req.onerror = () => reject(req.error ?? new Error('getAll failed'));
  });
}

export async function clearUsage(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
  });
}

async function prune(): Promise<void> {
  const all = await listUsage();
  if (all.length <= LOG_CAP) return;
  const drop = all.length - LOG_CAP;
  const db = await openDb();
  const sorted = all.slice().sort((a, b) => a.ts - b.ts);
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (let i = 0; i < drop; i++) {
    const id = (sorted[i] as unknown as { id?: number }).id;
    if (typeof id === 'number') store.delete(id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('prune failed'));
  });
}

export interface UsageRollup {
  origin: string;
  /** Raw row count — useful for "X requests recorded". */
  count: number;
  /**
   * Sampling-adjusted estimate of real inference count, summing
   * `1 / samplingRate` across rows. For un-sampled tasks this equals
   * `count`. Render this in user-facing copy so the dashboard reflects
   * real per-origin pressure without bloating IndexedDB.
   */
  estimatedCount: number;
}

export function rollupByOrigin(entries: UsageEntry[]): UsageRollup[] {
  const stats = new Map<string, { count: number; estimatedCount: number }>();
  for (const e of entries) {
    const current = stats.get(e.origin) ?? { count: 0, estimatedCount: 0 };
    current.count += 1;
    const rate = resolveSamplingRate(e);
    current.estimatedCount += rate > 0 ? 1 / rate : 1;
    stats.set(e.origin, current);
  }
  return Array.from(stats, ([origin, s]) => ({
    origin,
    count: s.count,
    estimatedCount: Math.round(s.estimatedCount),
  })).sort((a, b) => b.estimatedCount - a.estimatedCount);
}

export interface BackendRollup {
  /** A `Backend` value, or 'unknown' for entries without a recorded source. */
  backend: string;
  count: number;
}

export function rollupByBackend(entries: UsageEntry[]): BackendRollup[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = e.source ?? 'unknown';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts, ([backend, count]) => ({ backend, count })).sort(
    (a, b) => b.count - a.count,
  );
}

/**
 * Human-readable "1 in N" annotation for a sampled row. Returns
 * `null` for un-sampled rows so the dashboard can omit the chip
 * entirely. Defensive: clamps the inverse so we never render
 * "1 in 0" for a malformed entry.
 */
export function describeSampling(entry: UsageEntry): string | null {
  const rate = entry.samplingRate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate >= 1) {
    return null;
  }
  const n = Math.max(2, Math.round(1 / rate));
  return `1 in ${n}`;
}

export interface TaskRollup {
  task: InferenceTask;
  /** Number of rows actually stored. */
  count: number;
  /** Estimated real inference count (count / samplingRate). */
  estimatedCount: number;
  /**
   * "1 in N" string when at least one row in this task was sampled,
   * else null. Dashboard surfaces this so users understand why a
   * task's recorded count is lower than they expect.
   */
  samplingNote: string | null;
}

export function rollupByTask(entries: UsageEntry[]): TaskRollup[] {
  const stats = new Map<InferenceTask, { count: number; estimatedCount: number; minRate: number }>();
  for (const e of entries) {
    const current = stats.get(e.task) ?? { count: 0, estimatedCount: 0, minRate: 1 };
    current.count += 1;
    const rate = resolveSamplingRate(e);
    current.estimatedCount += rate > 0 ? 1 / rate : 1;
    // Track the tightest sampling rate observed for this task so the
    // dashboard chip reflects the lossy-est view we have on it.
    if (rate < current.minRate) current.minRate = rate;
    stats.set(e.task, current);
  }
  return Array.from(stats, ([task, s]) => ({
    task,
    count: s.count,
    estimatedCount: Math.round(s.estimatedCount),
    samplingNote: s.minRate < 1 ? `1 in ${Math.max(2, Math.round(1 / s.minRate))}` : null,
  })).sort((a, b) => b.estimatedCount - a.estimatedCount);
}
