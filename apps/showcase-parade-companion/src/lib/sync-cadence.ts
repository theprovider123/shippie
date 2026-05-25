/**
 * Sync cadence policy — how often to publish/pull fan pulse from the relay.
 *
 * Round 9: a flat 20-second poll over a 2-hour parade is ~360 requests per
 * phone, which drains the battery a fan needs to actually find their friends.
 * Tier the cadence by user intent:
 *
 *   - `pause`   — tab hidden; visibility-change resumes
 *   - `slow`    — battery-saver ON (1 min)
 *   - `normal`  — foreground + battery-saver OFF (20 s)
 *
 * On a failed sync, apply exponential backoff (30 → 60 → 120 s) until the
 * next success, then reset.
 */

export type SyncMode = 'pause' | 'slow' | 'normal';

const NORMAL_MS = 20_000;
const SLOW_MS = 60_000;
const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000] as const;

export function nextSyncDelayMs(mode: SyncMode, failureCount: number): number | null {
  if (mode === 'pause') return null;
  if (failureCount > 0) {
    const index = Math.min(failureCount - 1, BACKOFF_STEPS_MS.length - 1);
    return BACKOFF_STEPS_MS[index]!;
  }
  return mode === 'slow' ? SLOW_MS : NORMAL_MS;
}

export function resolveSyncMode(options: {
  online: boolean;
  hidden: boolean;
  batterySaver: boolean;
}): SyncMode {
  if (!options.online || options.hidden) return 'pause';
  return options.batterySaver ? 'slow' : 'normal';
}

export function stableSyncJitterMs(seed: string, spreadMs: number, floorMs = 0): number {
  const spread = Math.max(0, Math.floor(spreadMs));
  const floor = Math.max(0, Math.floor(floorMs));
  if (spread === 0) return floor;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return floor + (Math.abs(hash) % (spread + 1));
}
