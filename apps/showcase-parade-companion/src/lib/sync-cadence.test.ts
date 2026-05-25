import { describe, expect, test } from 'bun:test';
import { nextSyncDelayMs, resolveSyncMode } from './sync-cadence';

describe('sync-cadence', () => {
  test('resolves to pause when offline or hidden', () => {
    expect(resolveSyncMode({ online: false, hidden: false, batterySaver: false })).toBe('pause');
    expect(resolveSyncMode({ online: true, hidden: true, batterySaver: false })).toBe('pause');
  });

  test('resolves to slow when battery-saver is on', () => {
    expect(resolveSyncMode({ online: true, hidden: false, batterySaver: true })).toBe('slow');
  });

  test('resolves to normal when foreground and battery-saver is off', () => {
    expect(resolveSyncMode({ online: true, hidden: false, batterySaver: false })).toBe('normal');
  });

  test('paused mode returns null delay', () => {
    expect(nextSyncDelayMs('pause', 0)).toBeNull();
    expect(nextSyncDelayMs('pause', 3)).toBeNull();
  });

  test('normal mode polls every 20s', () => {
    expect(nextSyncDelayMs('normal', 0)).toBe(20_000);
  });

  test('slow mode polls every 60s', () => {
    expect(nextSyncDelayMs('slow', 0)).toBe(60_000);
  });

  test('exponential backoff steps 30 → 60 → 120 s', () => {
    expect(nextSyncDelayMs('normal', 1)).toBe(30_000);
    expect(nextSyncDelayMs('normal', 2)).toBe(60_000);
    expect(nextSyncDelayMs('normal', 3)).toBe(120_000);
    // Caps at the last step.
    expect(nextSyncDelayMs('normal', 8)).toBe(120_000);
  });

  test('backoff applies regardless of cadence mode', () => {
    expect(nextSyncDelayMs('slow', 2)).toBe(60_000);
  });
});
