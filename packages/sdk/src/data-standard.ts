export const SHIPPIE_DATA_STANDARD_VERSION = 'shippie-app-data-v0.6' as const;

export type ShippieDataMode = 'shippie-documents' | 'local-only' | 'none';
export type ShippieDataRecovery = 'inherited' | 'none';
export type ShippieDataMigration = 'snapshot-v0' | 'custom' | 'none';
export type ShippieDataSnapshots = 'inherited' | 'none';
export type ShippieDataMedia = 'encrypted-chunked' | 'none';
export type ShippieDataRealtime = 'inherited' | 'none';

export interface ShippieDataStorageScope {
  keys: string[];
  prefixes: string[];
}

export interface ShippieDataPolicy {
  mode: ShippieDataMode;
  documents: string[];
  attachments: boolean;
  recovery: ShippieDataRecovery;
  migrations: ShippieDataMigration;
  snapshots: ShippieDataSnapshots;
  media: ShippieDataMedia;
  realtime: ShippieDataRealtime;
  localStorage: ShippieDataStorageScope;
}

export const defaultShippieDataPolicy: ShippieDataPolicy = {
  mode: 'shippie-documents',
  documents: ['main'],
  attachments: false,
  recovery: 'inherited',
  migrations: 'snapshot-v0',
  snapshots: 'inherited',
  media: 'none',
  realtime: 'inherited',
  localStorage: { keys: [], prefixes: [] },
};

export function createShippieDataPolicy(
  overrides: Partial<ShippieDataPolicy> = {},
): ShippieDataPolicy {
  const mode = overrides.mode ?? defaultShippieDataPolicy.mode;
  return {
    mode,
    documents:
      overrides.documents && overrides.documents.length > 0
        ? [...overrides.documents]
        : mode === 'shippie-documents'
          ? [...defaultShippieDataPolicy.documents]
          : [],
    attachments: overrides.attachments ?? defaultShippieDataPolicy.attachments,
    recovery:
      overrides.recovery ?? (mode === 'shippie-documents' ? 'inherited' : 'none'),
    migrations:
      overrides.migrations ?? (mode === 'shippie-documents' ? 'snapshot-v0' : 'none'),
    snapshots:
      overrides.snapshots ?? (mode === 'shippie-documents' ? 'inherited' : 'none'),
    media:
      overrides.media ??
      (mode === 'shippie-documents' && (overrides.attachments ?? defaultShippieDataPolicy.attachments)
        ? 'encrypted-chunked'
        : 'none'),
    realtime:
      overrides.realtime ?? (mode === 'shippie-documents' ? 'inherited' : 'none'),
    localStorage: {
      keys: [...(overrides.localStorage?.keys ?? defaultShippieDataPolicy.localStorage.keys)],
      prefixes: [...(overrides.localStorage?.prefixes ?? defaultShippieDataPolicy.localStorage.prefixes)],
    },
  };
}
