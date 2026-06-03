import { afterEach, describe, expect, test, vi } from 'vitest';
import { describeOfflineHealth, withPromiseTimeout } from './download-app';

afterEach(() => {
  vi.useRealTimers();
});

describe('offline health labels', () => {
  test('only calls a capsule ready when saved or cache-confirmed', () => {
    expect(describeOfflineHealth({ slug: 'palate', state: 'saved', done: 0, total: 0 }).label).toBe('Ready offline');
    expect(describeOfflineHealth({ slug: 'palate', state: 'partial', done: 0, total: 12 }, { online: true })).toMatchObject({
      state: 'needs_refresh',
      actionable: true,
    });
  });

  test('downgrades repairable misses when the browser is offline', () => {
    expect(describeOfflineHealth({ slug: 'palate', state: 'evicted', done: 0, total: 0 }, { online: false })).toMatchObject({
      state: 'needs_connection',
      label: 'Needs connection',
      actionable: false,
    });
  });

  test('distinguishes automatic repair from first-time save', () => {
    expect(
      describeOfflineHealth({
        slug: 'chiwit',
        state: 'downloading',
        phase: 'downloading',
        done: 4,
        total: 10,
        repairing: true,
      }),
    ).toMatchObject({
      state: 'repairing',
      label: 'Repairing offline copy',
      detail: '4/10 files verified',
    });
  });

  test('times out service-worker readiness instead of leaving saving state stuck', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => {});
    const result = withPromiseTimeout(pending, 10, 'ready');
    const assertion = expect(result).rejects.toThrow('sw_timeout_ready');

    await vi.advanceTimersByTimeAsync(10);

    await assertion;
  });
});
