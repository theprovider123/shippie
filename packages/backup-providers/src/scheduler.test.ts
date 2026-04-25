/**
 * Tests for the backup scheduler.
 *
 * Covers:
 *   - "due" calculation (daily / weekly / manual / never-run)
 *   - tick() runs the upload exactly when due
 *   - state transitions on success vs failure
 *   - retry on token errors → never throws to the caller
 *   - prune is fired only after a successful upload
 */
import { describe, expect, test } from 'bun:test';
import {
  isDue,
  nextScheduledAt,
  runOnce,
  tick,
  statusFromState,
  type SchedulerState,
  type SchedulerDeps,
} from './scheduler.ts';
import type {
  BackupAttemptResult,
  BackupConfig,
  BackupProviderApi,
  OAuthToken,
} from './types.ts';

const DAY = 24 * 60 * 60 * 1000;

const baseConfig: BackupConfig = {
  provider: 'google-drive',
  frequency: 'daily',
  passphrase: 'pass',
  retention: 30,
};

function tokenFn(token: OAuthToken | null = { accessToken: 't', expiresAt: Date.now() + DAY, scope: 'x', issuedAt: Date.now() }): SchedulerDeps['getToken'] {
  return async () => {
    if (!token) throw new Error('no token');
    return token;
  };
}

function provider(overrides: Partial<BackupProviderApi> = {}): BackupProviderApi & {
  uploads: number;
  prunes: number;
} {
  let uploads = 0;
  let prunes = 0;
  const api = {
    id: 'google-drive' as const,
    upload: async () => {
      uploads += 1;
      return {
        ok: true,
        fileId: 'f1',
        fileName: 'name',
        bytes: 100,
        attemptedAt: Date.now(),
      } satisfies BackupAttemptResult;
    },
    list: async () => [],
    download: async () => new Uint8Array(),
    prune: async () => {
      prunes += 1;
      return { deleted: 0 };
    },
    ...overrides,
  };
  return new Proxy(api, {
    get(t, p) {
      if (p === 'uploads') return uploads;
      if (p === 'prunes') return prunes;
      return (t as Record<string, unknown>)[p as string];
    },
  }) as BackupProviderApi & { uploads: number; prunes: number };
}

describe('isDue', () => {
  test('never-run is due immediately', () => {
    expect(isDue(baseConfig, undefined, Date.now())).toBe(true);
  });

  test('daily is due 24h after last success', () => {
    const last = Date.parse('2026-04-24T00:00:00Z');
    expect(isDue(baseConfig, last, last + DAY - 1)).toBe(false);
    expect(isDue(baseConfig, last, last + DAY + 1)).toBe(true);
  });

  test('manual is never due', () => {
    expect(isDue({ ...baseConfig, frequency: 'manual' }, undefined, Date.now())).toBe(false);
  });

  test('weekly waits 7 days', () => {
    const cfg: BackupConfig = { ...baseConfig, frequency: 'weekly' };
    const last = 1000;
    expect(isDue(cfg, last, last + 6 * DAY)).toBe(false);
    expect(isDue(cfg, last, last + 7 * DAY + 1)).toBe(true);
  });
});

describe('nextScheduledAt', () => {
  test('returns null for manual', () => {
    expect(nextScheduledAt({ ...baseConfig, frequency: 'manual' }, 1, 1)).toBeNull();
  });

  test('snaps forward to hourLocal when set', () => {
    const cfg: BackupConfig = { ...baseConfig, hourLocal: 3 };
    const last = Date.parse('2026-04-24T00:00:00Z');
    const next = nextScheduledAt(cfg, last, last);
    expect(next).not.toBeNull();
    const d = new Date(next!);
    expect(d.getHours()).toBe(3);
  });
});

describe('runOnce', () => {
  test('persists success state and triggers prune', async () => {
    const p = provider();
    let saved: SchedulerState | null = null;
    const state: SchedulerState = { config: baseConfig };
    const result = await runOnce(
      state,
      {
        appSlug: 'recipes',
        schemaVersion: 1,
        tables: ['recipes'],
        produceSnapshot: async () => new Uint8Array([1, 2, 3]),
      },
      {
        provider: p,
        getToken: tokenFn(),
        saveState: async (s) => {
          saved = s;
        },
      },
    );
    expect(result.ran).toBe(true);
    expect(result.attempt?.ok).toBe(true);
    expect(p.uploads).toBe(1);
    expect(p.prunes).toBe(1);
    expect(saved).not.toBeNull();
    expect(saved!.lastSuccessAt).toBeDefined();
    expect(saved!.lastError).toBeUndefined();
  });

  test('persists failure state and skips prune on upload failure', async () => {
    const p = provider({
      upload: async () => ({ ok: false, error: 'drive 500', attemptedAt: Date.now() }),
    });
    let saved: SchedulerState | null = null;
    const state: SchedulerState = { config: baseConfig, lastSuccessAt: Date.now() - 2 * DAY };
    const result = await runOnce(
      state,
      {
        appSlug: 'recipes',
        schemaVersion: 1,
        tables: ['recipes'],
        produceSnapshot: async () => new Uint8Array([1]),
      },
      {
        provider: p,
        getToken: tokenFn(),
        saveState: async (s) => {
          saved = s;
        },
      },
    );
    expect(result.attempt?.ok).toBe(false);
    expect(p.uploads).toBe(1);
    expect(p.prunes).toBe(0);
    expect(saved!.lastError).toBe('drive 500');
    expect(saved!.lastFailureAt).toBeDefined();
  });

  test('token error does not crash; recorded as failure', async () => {
    const p = provider();
    let saved: SchedulerState | null = null;
    const state: SchedulerState = { config: baseConfig };
    const result = await runOnce(
      state,
      {
        appSlug: 'recipes',
        schemaVersion: 1,
        tables: ['recipes'],
        produceSnapshot: async () => new Uint8Array([1]),
      },
      {
        provider: p,
        getToken: tokenFn(null),
        saveState: async (s) => {
          saved = s;
        },
      },
    );
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('token_error');
    expect(p.uploads).toBe(0);
    expect(saved!.lastError).toMatch(/token/);
  });
});

describe('tick', () => {
  test('skips when not configured', async () => {
    const result = await tick(
      { config: null },
      {
        appSlug: 'r',
        schemaVersion: 1,
        tables: [],
        produceSnapshot: async () => new Uint8Array(),
      },
      {
        provider: provider(),
        getToken: tokenFn(),
        saveState: async () => {},
      },
    );
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('not_configured');
  });

  test('skips when not due', async () => {
    const lastSuccessAt = Date.now() - 1000;
    const result = await tick(
      { config: baseConfig, lastSuccessAt },
      {
        appSlug: 'r',
        schemaVersion: 1,
        tables: [],
        produceSnapshot: async () => new Uint8Array(),
      },
      {
        provider: provider(),
        getToken: tokenFn(),
        saveState: async () => {},
      },
    );
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('not_due');
  });
});

describe('statusFromState', () => {
  test('reports configured=false when no config', () => {
    expect(statusFromState({ config: null }).configured).toBe(false);
  });

  test('reports next-scheduled when configured', () => {
    const last = Date.now();
    const status = statusFromState({ config: baseConfig, lastSuccessAt: last }, last);
    expect(status.configured).toBe(true);
    expect(status.provider).toBe('google-drive');
    expect(status.nextScheduledAt).toBeGreaterThan(last);
  });
});
