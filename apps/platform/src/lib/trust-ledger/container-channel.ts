/**
 * Container rollback channel (5C).
 *
 * This is the on-device opt-in. The user (or Safe Mode) sets
 * `localStorage[CONTAINER_CHANNEL_LS_KEY]` to a pinned container
 * version. The Service Worker reads it during navigation and, if
 * present and matching a cached version, serves the pinned shell
 * instead of letting `skipWaiting` upgrade to a newer broken one.
 *
 * 5C scope:
 *   - The pinned-channel constant + helpers live here.
 *   - The Safe Mode UI surfaces pin/release.
 *   - The Proof-gate-triggered automatic rollback is FUTURE work —
 *     it needs server-side "is this release degrading on N devices in
 *     M hours" math, which lives in the Proof rollup cron. 5C ships
 *     the user-controllable rollback first; the automated halt is a
 *     5C follow-up patch.
 */

export const CONTAINER_CHANNEL_LS_KEY = 'shippie.container-channel.v1';

/**
 * The current "known-good" pinned channel ID. Bumped at release time
 * when a new release has soaked through Proof signals successfully.
 * Until the SW reads this, pinning is advisory.
 */
export const PINNED_CHANNEL = 'stable-2026-05-30';

/**
 * Get the user-pinned channel ID, or null when they're tracking the
 * latest release.
 */
export function getPinnedChannel(storage: Storage = globalThis.localStorage): string | null {
  if (!storage) return null;
  return storage.getItem(CONTAINER_CHANNEL_LS_KEY);
}

/**
 * Pin the container to a specific channel id.
 */
export function pinContainerChannel(channel: string, storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  storage.setItem(CONTAINER_CHANNEL_LS_KEY, channel);
}

/**
 * Release any pin.
 */
export function releaseContainerChannel(storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  storage.removeItem(CONTAINER_CHANNEL_LS_KEY);
}

/**
 * Health gate input — the Proof aggregator passes one of these per
 * release; 5C will land a server-side cron that consumes them. For
 * now this is the shape the future cron will write to D1 and the SW
 * will read at navigation.
 */
export interface ChannelHealthSignal {
  channel: string;
  devices_seen: number;
  fail_closed_rate: number; // 0..1
  window_hours: number;
  is_halted: boolean;
}

/**
 * Decide whether a candidate channel is healthy enough to roll out.
 *
 * Defaults pessimistic: any channel with <100 devices reporting or
 * fail-closed rate >2% in the window is treated as halted.
 */
export interface RolloutGate {
  minDevices?: number;
  maxFailClosedRate?: number;
}

export function isChannelHealthy(
  signal: ChannelHealthSignal,
  gate: RolloutGate = {},
): boolean {
  if (signal.is_halted) return false;
  const minDevices = gate.minDevices ?? 100;
  const maxFailClosedRate = gate.maxFailClosedRate ?? 0.02;
  if (signal.devices_seen < minDevices) return false;
  if (signal.fail_closed_rate > maxFailClosedRate) return false;
  return true;
}
