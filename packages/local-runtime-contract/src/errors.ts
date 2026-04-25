export type LocalRuntimeErrorCode =
  | 'quota_exceeded'
  | 'storage_evicted'
  | 'migration_failed'
  | 'unsupported'
  | 'permission_denied'
  | 'backup_failed'
  | 'restore_failed';

export interface LocalRuntimeErrorOptions {
  code: LocalRuntimeErrorCode;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class LocalRuntimeError extends Error {
  readonly code: LocalRuntimeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, opts: LocalRuntimeErrorOptions) {
    super(message);
    this.name = 'LocalRuntimeError';
    this.code = opts.code;
    this.details = opts.details;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export class QuotaError extends LocalRuntimeError {
  constructor(message = 'Local storage quota exceeded', opts: Omit<LocalRuntimeErrorOptions, 'code'> = {}) {
    super(message, { ...opts, code: 'quota_exceeded' });
    this.name = 'QuotaError';
  }
}

export class EvictionError extends LocalRuntimeError {
  constructor(message = 'Local storage appears to have been evicted', opts: Omit<LocalRuntimeErrorOptions, 'code'> = {}) {
    super(message, { ...opts, code: 'storage_evicted' });
    this.name = 'EvictionError';
  }
}

export class MigrationError extends LocalRuntimeError {
  constructor(message = 'Local database migration failed', opts: Omit<LocalRuntimeErrorOptions, 'code'> = {}) {
    super(message, { ...opts, code: 'migration_failed' });
    this.name = 'MigrationError';
  }
}

export class UnsupportedError extends LocalRuntimeError {
  constructor(message = 'Local runtime feature is unsupported', opts: Omit<LocalRuntimeErrorOptions, 'code'> = {}) {
    super(message, { ...opts, code: 'unsupported' });
    this.name = 'UnsupportedError';
  }
}
