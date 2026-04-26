/**
 * Dispatcher routes cron strings to the right handler. Uses dependency
 * injection (handleScheduled accepts an optional `handlers` arg) instead
 * of module mocking so the test is runtime-agnostic — runs cleanly under
 * both vitest and `bun test`.
 */
import { describe, expect, test } from 'vitest';
import type { ScheduledController } from '@cloudflare/workers-types';
import { handleScheduled, type CronEnv, type CronHandlers } from './index';

interface CallCounts {
  reconcileKv: number;
  reapTrials: number;
  rollups: number;
  retention: number;
  capabilityBadges: number;
}

function makeHandlers(counts: CallCounts): CronHandlers {
  return {
    reconcileKv: async () => {
      counts.reconcileKv += 1;
      return { checked: 0, updated: [], csp_updated: [], missing_version: [], errors: [] };
    },
    reapTrials: async () => {
      counts.reapTrials += 1;
      return { archived: 0, slugs: [], errors: [] };
    },
    rollups: async () => {
      counts.rollups += 1;
      return { day: '2026-04-23', rolled_up: 0, apps: 0, pairs: 0 };
    },
    retention: async () => {
      counts.retention += 1;
      return { cutoff: '2026-02-23T00:00:00.000Z', deleted: 0 };
    },
    capabilityBadges: async () => {
      counts.capabilityBadges += 1;
      return { appsScanned: 0, badgesAwarded: 0, badgesRevoked: 0 };
    },
  };
}

function makeCounts(): CallCounts {
  return { reconcileKv: 0, reapTrials: 0, rollups: 0, retention: 0, capabilityBadges: 0 };
}

function controller(cron: string): ScheduledController {
  return { cron, scheduledTime: 0, noRetry: () => undefined } as unknown as ScheduledController;
}

const env: CronEnv = { DB: {} as never, CACHE: {} as never };

describe('handleScheduled', () => {
  test('dispatches */5 cron to reconcileKv', async () => {
    const counts = makeCounts();
    await handleScheduled(controller('*/5 * * * *'), env, makeHandlers(counts));
    expect(counts.reconcileKv).toBe(1);
    expect(counts.reapTrials).toBe(0);
    expect(counts.rollups).toBe(0);
    expect(counts.retention).toBe(0);
  });

  test('dispatches hourly cron to BOTH reapTrials and rollups', async () => {
    const counts = makeCounts();
    await handleScheduled(controller('0 * * * *'), env, makeHandlers(counts));
    expect(counts.reapTrials).toBe(1);
    expect(counts.rollups).toBe(1);
    expect(counts.reconcileKv).toBe(0);
    expect(counts.retention).toBe(0);
  });

  test('dispatches daily 4am cron to BOTH retention and capabilityBadges', async () => {
    const counts = makeCounts();
    await handleScheduled(controller('0 4 * * *'), env, makeHandlers(counts));
    expect(counts.retention).toBe(1);
    expect(counts.capabilityBadges).toBe(1);
    expect(counts.reconcileKv).toBe(0);
    expect(counts.reapTrials).toBe(0);
    expect(counts.rollups).toBe(0);
  });

  test('unknown cron string is logged and ignored', async () => {
    const counts = makeCounts();
    await handleScheduled(controller('99 99 99 99 99'), env, makeHandlers(counts));
    expect(counts.reconcileKv).toBe(0);
    expect(counts.reapTrials).toBe(0);
    expect(counts.rollups).toBe(0);
    expect(counts.retention).toBe(0);
  });
});
