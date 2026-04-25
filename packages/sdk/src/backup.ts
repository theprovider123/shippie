/**
 * shippie.backup — control surface for cloud backup providers.
 *
 * Glue between `@shippie/backup-providers` and the SDK consumer. The
 * actual upload/encrypt/network work lives in the providers package.
 * This file is *only* the public-facing API + a tiny in-memory state
 * cache; the maker app is expected to persist the SchedulerState
 * to OPFS via `local-files` (or equivalent) — we never touch
 * localStorage.
 *
 * The OAuth flow itself runs from the wrapper (popup + postMessage);
 * the SDK accepts an OAuth token and forwards it to the provider.
 */
import {
  GoogleDriveProvider,
  GOOGLE_DRIVE_SCOPES,
  runOnce as runOnceScheduler,
  statusFromState,
  type BackupConfig,
  type BackupProviderApi,
  type BackupSnapshotInput,
  type BackupStatus,
  type OAuthToken,
  type SchedulerState,
} from '@shippie/backup-providers';

/**
 * The maker app supplies these — the SDK doesn't know how to
 * snapshot the local DB or read OPFS files generically. local-db
 * exposes a `snapshot()` helper; the wrapper wires it up via
 * `configureBackup({ snapshotProvider })`.
 */
export interface BackupRuntime {
  /** Producer for the encrypted plaintext (rows + files index). */
  produceSnapshot: () => Promise<Uint8Array>;
  /** Schema version stamped into the backup envelope. */
  schemaVersion: number;
  /** Table list stamped into the backup envelope. */
  tables: string[];
  /**
   * Resolve the latest OAuth token. Should refresh transparently
   * when expiry < safety margin. The SDK never stores the token;
   * it asks the runtime each call.
   */
  getToken: () => Promise<OAuthToken>;
  /** App slug for cloud folder naming. */
  appSlug: string;
  /** Persist state mutations (Your Data panel reads from here). */
  loadState: () => Promise<SchedulerState>;
  saveState: (state: SchedulerState) => Promise<void>;
}

let runtime: BackupRuntime | null = null;
let providerOverride: BackupProviderApi | null = null;

export function _attachBackupRuntime(rt: BackupRuntime | null): void {
  runtime = rt;
}

/** Test-only injection — replaces the real provider with a fake. */
export function _setBackupProvider(p: BackupProviderApi | null): void {
  providerOverride = p;
}

function provider(): BackupProviderApi {
  if (providerOverride) return providerOverride;
  return new GoogleDriveProvider();
}

export interface ConfigureBackupInput {
  provider: 'google-drive';
  frequency: 'daily' | 'weekly' | 'manual';
  passphrase: string;
  retention?: number;
  hourLocal?: number;
}

/**
 * Persist a backup configuration. Does NOT trigger an immediate run;
 * call `now()` for that.
 */
export async function configure(input: ConfigureBackupInput): Promise<void> {
  if (!runtime) throw new Error('shippie.backup: runtime not attached');
  const config: BackupConfig = {
    provider: input.provider,
    frequency: input.frequency,
    passphrase: input.passphrase,
    retention: input.retention,
    hourLocal: input.hourLocal,
  };
  const state = await runtime.loadState();
  await runtime.saveState({ ...state, config });
}

/** Run a backup right now, regardless of schedule. */
export async function now(): Promise<{ ok: boolean; error?: string }> {
  if (!runtime) throw new Error('shippie.backup: runtime not attached');
  const state = await runtime.loadState();
  if (!state.config) {
    return { ok: false, error: 'not_configured' };
  }
  const result = await runOnceScheduler(
    state,
    snapshotInput(),
    {
      provider: provider(),
      getToken: runtime.getToken,
      saveState: runtime.saveState,
    },
  );
  return result.attempt
    ? { ok: result.attempt.ok, error: result.attempt.error }
    : { ok: false, error: result.reason };
}

/** Read the current state (last success/failure, next scheduled). */
export async function status(): Promise<BackupStatus> {
  if (!runtime) return { configured: false };
  const state = await runtime.loadState();
  return statusFromState(state);
}

/** OAuth scopes the maker app must request when initiating sign-in. */
export function requiredScopes(provider: 'google-drive'): string[] {
  if (provider === 'google-drive') return GOOGLE_DRIVE_SCOPES;
  return [];
}

function snapshotInput(): BackupSnapshotInput {
  if (!runtime) throw new Error('shippie.backup: runtime not attached');
  return {
    appSlug: runtime.appSlug,
    schemaVersion: runtime.schemaVersion,
    tables: runtime.tables,
    produceSnapshot: runtime.produceSnapshot,
  };
}

export const backup = {
  configure,
  now,
  status,
  requiredScopes,
};
