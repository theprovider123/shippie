import { describe, expect, test } from 'bun:test';
import {
  EvictionError,
  QUOTA_CRITICAL_RATIO,
  QUOTA_WARNING_RATIO,
  SHIPPIE_BACKUP_MAGIC,
  SHIPPIE_BACKUP_VERSION,
  detectLocalRuntimeCapabilities,
  quotaWarningLevel,
} from './index.ts';

describe('@shippie/local-runtime-contract', () => {
  test('exports stable backup constants', () => {
    expect(SHIPPIE_BACKUP_MAGIC).toBe('SHIPPIEBAK');
    expect(SHIPPIE_BACKUP_VERSION).toBe(1);
    expect(QUOTA_WARNING_RATIO).toBe(0.8);
    expect(QUOTA_CRITICAL_RATIO).toBe(0.95);
  });

  test('computes quota warning levels', () => {
    expect(quotaWarningLevel(10, 100)).toBe('none');
    expect(quotaWarningLevel(80, 100)).toBe('high');
    expect(quotaWarningLevel(95, 100)).toBe('critical');
    expect(quotaWarningLevel(10)).toBe('none');
  });

  test('detects capabilities without throwing in non-browser tests', () => {
    const caps = detectLocalRuntimeCapabilities();
    expect(typeof caps.wasm).toBe('boolean');
    expect(typeof caps.opfs).toBe('boolean');
    expect(typeof caps.webGpu).toBe('boolean');
  });

  test('local runtime errors carry machine-readable codes', () => {
    const err = new EvictionError('sentinel missing', { details: { table: '__shippie_meta' } });
    expect(err.name).toBe('EvictionError');
    expect(err.code).toBe('storage_evicted');
    expect(err.details?.table).toBe('__shippie_meta');
  });
});
