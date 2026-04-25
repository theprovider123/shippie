/**
 * @shippie/backup-providers
 *
 * Cloud backup for Shippie apps. Drive is the only provider in v1
 * per the post-cloud platform plan. All ciphertext is opaque to the
 * provider — encryption keys are derived from the user's passphrase
 * by `@shippie/local-db/backup`. Tokens stay on the device, in OPFS,
 * never on a Shippie server, never in localStorage.
 */
export type {
  BackupAttemptResult,
  BackupConfig,
  BackupFrequency,
  BackupProviderApi,
  BackupProviderId,
  BackupStatus,
  OAuthToken,
  RemoteBackupEntry,
} from './types.ts';

export {
  GoogleDriveProvider,
  GOOGLE_DRIVE_SCOPES,
  BackupTokenExpiredError,
  BackupProviderError,
  type GoogleDriveConfig,
} from './google-drive.ts';

export {
  encryptBackup,
  decryptBackup,
  type EncryptInput,
  type EncryptedBlob,
} from './crypto.ts';

export {
  signEnvelope,
  verifyEnvelope,
  generateCodeVerifier,
  deriveCodeChallenge,
  buildAuthorizeUrl,
  base64UrlEncode,
  base64UrlDecode,
  type OAuthEnvelope,
  type SignedEnvelope,
  type VerifyOptions,
  type RequestTokenOptions,
  type RequestTokenResult,
} from './oauth-coordinator.ts';

export {
  tick,
  runOnce,
  isDue,
  nextScheduledAt,
  frequencyMs,
  statusFromState,
  type SchedulerState,
  type SchedulerDeps,
  type BackupSnapshotInput,
  type TickResult,
} from './scheduler.ts';
