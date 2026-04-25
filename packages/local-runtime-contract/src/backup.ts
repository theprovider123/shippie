export const SHIPPIE_BACKUP_MAGIC = 'SHIPPIEBAK';
export const SHIPPIE_BACKUP_VERSION = 1;
export const QUOTA_WARNING_RATIO = 0.8;
export const QUOTA_CRITICAL_RATIO = 0.95;

export interface ShippieBackupHeader {
  appId: string;
  schemaVersion: number;
  createdAt: string;
  kdf: 'PBKDF2-SHA256';
  salt: string;
  nonce: string;
  tables: string[];
  contentHash: string;
}

export function quotaWarningLevel(
  usedBytes: number,
  quotaBytes?: number,
): 'none' | 'high' | 'critical' {
  if (!quotaBytes || quotaBytes <= 0) return 'none';
  const ratio = usedBytes / quotaBytes;
  if (ratio >= QUOTA_CRITICAL_RATIO) return 'critical';
  if (ratio >= QUOTA_WARNING_RATIO) return 'high';
  return 'none';
}
