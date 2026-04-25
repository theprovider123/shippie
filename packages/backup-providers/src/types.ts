/**
 * Public types for `@shippie/backup-providers`.
 *
 * Architectural commitments (locked):
 *  - Tokens are stored locally per-app in OPFS — never in localStorage,
 *    never on a Shippie server.
 *  - Backups are end-to-end encrypted with the user's passphrase
 *    (Argon2id-derived key + AES-256-GCM in @shippie/local-db/backup).
 *    The cloud provider sees opaque ciphertext.
 *  - The OAuth coordinator at `https://shippie.app/oauth/<provider>`
 *    is the only redirect URI registered with each provider — there is
 *    a single client registration per provider for the whole platform.
 */

export type BackupProviderId = 'google-drive';

export type BackupFrequency = 'daily' | 'weekly' | 'manual';

export interface BackupConfig {
  /** Which cloud the encrypted blob lands in. */
  provider: BackupProviderId;
  /** How often the scheduler attempts a backup. */
  frequency: BackupFrequency;
  /**
   * Passphrase used to derive the AES-256-GCM key. Held only in memory
   * during configure() and during a backup; we never persist it.
   * The user must remember it — losing it means losing the backup.
   */
  passphrase: string;
  /** Days of history to keep. Older backups are pruned by the provider. */
  retention?: number;
  /** Local hour of day (0-23) to schedule daily/weekly runs. */
  hourLocal?: number;
}

export interface OAuthToken {
  /** OAuth 2.0 access token. NEVER log this. */
  accessToken: string;
  /** Refresh token, when the provider grants one. */
  refreshToken?: string;
  /** Epoch millis when the access token expires. */
  expiresAt: number;
  /** Granted scopes, space-separated as returned by the provider. */
  scope: string;
  /** When we obtained the token. */
  issuedAt: number;
}

export interface BackupStatus {
  configured: boolean;
  provider?: BackupProviderId;
  frequency?: BackupFrequency;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  nextScheduledAt?: number;
  retention?: number;
}

export interface BackupAttemptResult {
  ok: boolean;
  /** Provider-assigned ID for the uploaded file. */
  fileId?: string;
  /** Human-readable file name in the user's cloud folder. */
  fileName?: string;
  /** Bytes uploaded (ciphertext length). */
  bytes?: number;
  error?: string;
  attemptedAt: number;
}

/**
 * One row in the user's backup history, surfaced in Your Data panel.
 * The plan calls for Auto-restore: app loads on a new device, panel
 * checks Drive for recent backup, prompts "Restore from N hours ago?".
 */
export interface RemoteBackupEntry {
  fileId: string;
  fileName: string;
  /** Epoch millis the file was created in the cloud. */
  createdAt: number;
  /** Ciphertext byte size; `null` when the provider doesn't expose it. */
  size: number | null;
}

export interface BackupProviderApi {
  readonly id: BackupProviderId;
  /**
   * Encrypts a snapshot blob (already opaque to us — produced by
   * @shippie/local-db) and uploads it under the configured app slug.
   */
  upload(input: {
    appSlug: string;
    plaintext: Uint8Array;
    schemaVersion: number;
    tables: string[];
    passphrase: string;
    token: OAuthToken;
  }): Promise<BackupAttemptResult>;

  /** List recent encrypted backups for the current app slug. */
  list(input: { appSlug: string; token: OAuthToken }): Promise<RemoteBackupEntry[]>;

  /**
   * Download + decrypt the most recent (or named) backup. Returns the
   * plaintext bytes — the caller pipes those back into local-db restore.
   */
  download(input: {
    fileId: string;
    passphrase: string;
    token: OAuthToken;
  }): Promise<Uint8Array>;

  /**
   * Delete entries older than `retentionDays`. Best-effort. Should
   * never throw on individual deletion failures.
   */
  prune(input: {
    appSlug: string;
    token: OAuthToken;
    retentionDays: number;
  }): Promise<{ deleted: number }>;
}
