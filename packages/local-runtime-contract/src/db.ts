export type LocalDbColumnType =
  | 'text'
  | 'integer'
  | 'real'
  | 'blob'
  | 'json'
  | 'datetime'
  | `${'text' | 'integer' | 'real' | 'blob' | 'json' | 'datetime'} ${string}`;

export type LocalDbSchema = Record<string, LocalDbColumnType>;
export type LocalDbRecord = Record<string, unknown>;

export interface LocalDbQueryOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

export interface LocalDbExportOptions extends LocalDbQueryOptions {
  format?: 'json' | 'sqlite' | 'shippiebak';
  passphrase?: string;
}

export interface LocalDbBackupInfo {
  createdAt: string;
  appId: string;
  schemaVersion: number;
  encrypted: boolean;
  tables?: string[];
  contentHash?: string;
}

export interface LocalDbUsage {
  usedBytes: number;
  quotaBytes?: number;
  persisted?: boolean;
  warningLevel?: 'none' | 'high' | 'critical';
}

export interface ShippieLocalDb {
  create(table: string, schema: LocalDbSchema): Promise<void>;
  insert<T extends LocalDbRecord>(table: string, value: T): Promise<void>;
  query<T extends LocalDbRecord = LocalDbRecord>(table: string, opts?: LocalDbQueryOptions): Promise<T[]>;
  search<T extends LocalDbRecord = LocalDbRecord>(table: string, query: string, opts?: LocalDbQueryOptions): Promise<T[]>;
  vectorSearch<T extends LocalDbRecord = LocalDbRecord>(
    table: string,
    vector: Float32Array,
    opts?: { limit?: number; column?: string },
  ): Promise<Array<T & { score: number }>>;
  update<T extends LocalDbRecord>(table: string, id: string, patch: Partial<T>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  count(table: string, opts?: Pick<LocalDbQueryOptions, 'where'>): Promise<number>;
  export(table: string, opts?: LocalDbExportOptions): Promise<Blob>;
  restore(backup: Blob, opts?: { passphrase?: string; dryRun?: boolean }): Promise<LocalDbBackupInfo>;
  lastBackup(): Promise<LocalDbBackupInfo | null>;
  usage(): Promise<LocalDbUsage>;
  requestPersistence(): Promise<boolean>;
}
