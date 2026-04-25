/**
 * Service-worker-friendly backup scheduler.
 *
 * The scheduler is intentionally framework-agnostic: it computes
 * "should we run now?" + the next-due timestamp from a `BackupConfig`
 * and the last-success record. The wrapper SDK installs a periodic
 * background sync trigger (`shippie-backup`) that, on every tick,
 * calls `tick()` here — if the answer is "run", we kick off the
 * provider's `upload()`.
 *
 * Also exposes a `runNow()` convenience for the user-driven
 * "Backup now" button in Your Data panel.
 */
import type {
  BackupAttemptResult,
  BackupConfig,
  BackupFrequency,
  BackupProviderApi,
  BackupStatus,
  OAuthToken,
} from './types.ts';

/**
 * Persistent state — caller stores this somewhere (OPFS via local-files,
 * not localStorage). The scheduler is pure and never touches storage.
 */
export interface SchedulerState {
  config: BackupConfig | null;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  lastFileId?: string;
  lastFileName?: string;
}

export interface BackupSnapshotInput {
  appSlug: string;
  schemaVersion: number;
  tables: string[];
  /** A function so we don't materialize the snapshot until we run. */
  produceSnapshot: () => Promise<Uint8Array>;
}

export interface SchedulerDeps {
  provider: BackupProviderApi;
  /** Returns the current valid token; refreshes if expiring. */
  getToken: () => Promise<OAuthToken>;
  /** Persist state mutations. */
  saveState: (state: SchedulerState) => Promise<void>;
  /** Test injection for `Date.now()`. */
  now?: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function frequencyMs(freq: BackupFrequency): number | null {
  if (freq === 'daily') return DAY_MS;
  if (freq === 'weekly') return WEEK_MS;
  return null; // manual
}

export function nextScheduledAt(
  config: BackupConfig,
  lastSuccessAt: number | undefined,
  now: number,
): number | null {
  const periodMs = frequencyMs(config.frequency);
  if (periodMs == null) return null;
  if (!lastSuccessAt) return now; // never ran — due immediately
  const baseline = lastSuccessAt + periodMs;
  if (config.hourLocal == null) return baseline;
  // Snap forward to the next occurrence of `hourLocal`.
  const d = new Date(baseline);
  d.setHours(config.hourLocal, 0, 0, 0);
  if (d.getTime() < baseline) d.setTime(d.getTime() + DAY_MS);
  return d.getTime();
}

export function isDue(
  config: BackupConfig,
  lastSuccessAt: number | undefined,
  now: number,
): boolean {
  const next = nextScheduledAt(config, lastSuccessAt, now);
  if (next == null) return false;
  return now >= next;
}

export interface TickResult {
  ran: boolean;
  attempt?: BackupAttemptResult;
  reason?: string;
  nextScheduledAt: number | null;
}

/**
 * Decide whether to run, and if so, run the upload + persist state.
 * Pure(ish): the only side effect is `deps.saveState()` and the
 * provider's network call.
 */
export async function tick(
  state: SchedulerState,
  snapshot: BackupSnapshotInput,
  deps: SchedulerDeps,
): Promise<TickResult> {
  const now = (deps.now ?? Date.now)();
  if (!state.config) {
    return { ran: false, reason: 'not_configured', nextScheduledAt: null };
  }
  const due = isDue(state.config, state.lastSuccessAt, now);
  const next = nextScheduledAt(state.config, state.lastSuccessAt, now);
  if (!due) {
    return { ran: false, reason: 'not_due', nextScheduledAt: next };
  }
  return runOnce(state, snapshot, deps);
}

export async function runOnce(
  state: SchedulerState,
  snapshot: BackupSnapshotInput,
  deps: SchedulerDeps,
): Promise<TickResult> {
  const now = (deps.now ?? Date.now)();
  if (!state.config) {
    return { ran: false, reason: 'not_configured', nextScheduledAt: null };
  }
  const config = state.config;
  let token: OAuthToken;
  try {
    token = await deps.getToken();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failed: SchedulerState = {
      ...state,
      lastFailureAt: now,
      lastError: `token: ${error}`,
    };
    await deps.saveState(failed);
    return {
      ran: false,
      reason: 'token_error',
      nextScheduledAt: nextScheduledAt(config, state.lastSuccessAt, now),
    };
  }
  const plaintext = await snapshot.produceSnapshot();
  const attempt = await deps.provider.upload({
    appSlug: snapshot.appSlug,
    plaintext,
    schemaVersion: snapshot.schemaVersion,
    tables: snapshot.tables,
    passphrase: config.passphrase,
    token,
  });
  const updated: SchedulerState = attempt.ok
    ? {
        ...state,
        lastSuccessAt: now,
        lastFailureAt: state.lastFailureAt,
        lastError: undefined,
        lastFileId: attempt.fileId,
        lastFileName: attempt.fileName,
      }
    : {
        ...state,
        lastFailureAt: now,
        lastError: attempt.error,
      };
  await deps.saveState(updated);

  // Pruning runs after a successful upload. Best-effort.
  if (attempt.ok && config.retention && config.retention > 0) {
    try {
      await deps.provider.prune({
        appSlug: snapshot.appSlug,
        token,
        retentionDays: config.retention,
      });
    } catch {
      // ignored — pruning failure should never fail the backup
    }
  }

  return {
    ran: true,
    attempt,
    nextScheduledAt: nextScheduledAt(
      config,
      attempt.ok ? now : state.lastSuccessAt,
      now,
    ),
  };
}

export function statusFromState(
  state: SchedulerState,
  now: number = Date.now(),
): BackupStatus {
  if (!state.config) return { configured: false };
  return {
    configured: true,
    provider: state.config.provider,
    frequency: state.config.frequency,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastError: state.lastError,
    nextScheduledAt: nextScheduledAt(state.config, state.lastSuccessAt, now) ?? undefined,
    retention: state.config.retention,
  };
}
