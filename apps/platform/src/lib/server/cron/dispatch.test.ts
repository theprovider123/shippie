import { describe, expect, test, vi } from 'vitest';
import type { ScheduledController } from '@cloudflare/workers-types';
import { handleScheduled } from './index';

vi.mock('./reconcile-kv', () => ({
  reconcileKv: vi.fn(async () => ({ checked: 0, updated: [], csp_updated: [], missing_version: [], errors: [] })),
}));
vi.mock('./reap-trials', () => ({
  reapTrials: vi.fn(async () => ({ archived: 0, slugs: [], errors: [] })),
}));
vi.mock('./rollups', () => ({
  rollups: vi.fn(async () => ({ day: '2026-04-23', rolled_up: 0, apps: 0, pairs: 0 })),
}));
vi.mock('./retention', () => ({
  retention: vi.fn(async () => ({ cutoff: '2026-02-23T00:00:00.000Z', deleted: 0 })),
}));

import { reconcileKv } from './reconcile-kv';
import { reapTrials } from './reap-trials';
import { rollups } from './rollups';
import { retention } from './retention';

function controller(cron: string): ScheduledController {
  return { cron, scheduledTime: 0, noRetry: () => undefined } as unknown as ScheduledController;
}

const env = { DB: {} as never, CACHE: {} as never };

describe('handleScheduled', () => {
  test('dispatches */5 cron to reconcileKv', async () => {
    await handleScheduled(controller('*/5 * * * *'), env);
    expect(reconcileKv).toHaveBeenCalledTimes(1);
  });

  test('dispatches hourly cron to BOTH reapTrials and rollups', async () => {
    vi.mocked(reapTrials).mockClear();
    vi.mocked(rollups).mockClear();
    await handleScheduled(controller('0 * * * *'), env);
    expect(reapTrials).toHaveBeenCalledTimes(1);
    expect(rollups).toHaveBeenCalledTimes(1);
  });

  test('dispatches daily 4am cron to retention', async () => {
    vi.mocked(retention).mockClear();
    await handleScheduled(controller('0 4 * * *'), env);
    expect(retention).toHaveBeenCalledTimes(1);
  });

  test('unknown cron string is logged and ignored', async () => {
    vi.mocked(reconcileKv).mockClear();
    await handleScheduled(controller('99 99 99 99 99'), env);
    expect(reconcileKv).not.toHaveBeenCalled();
  });
});
