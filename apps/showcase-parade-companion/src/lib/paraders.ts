/**
 * Paraders count — a mirror, not a leaderboard.
 *
 * We already publish anonymous `presence` fan events through the relay
 * (see `live-sync.ts`). This module counts how many unique phones have
 * tapped "I am here" recently — a crowd-energy number, not an identity.
 *
 * No leaderboards, no streaks, no per-fan reveal. The count is the message.
 */

import type { LngLat } from '../data/parade-2026';
import { isActive, type FanEvent } from './fan-events';
import { haversineMeters } from './geo';

export interface ParadersCount {
  /** Unique active `presence` source_ids across local + relay. */
  total: number;
  /** Unique active `presence` source_ids within NEARBY_RADIUS_M of `here`. */
  nearby: number | null;
}

const NEARBY_RADIUS_M = 500;

export function countActiveParaders(
  events: readonly FanEvent[],
  here: LngLat | null,
  now = Date.now(),
): ParadersCount {
  const totalIds = new Set<string>();
  const nearbyIds = new Set<string>();

  for (const event of events) {
    if (event.type !== 'presence') continue;
    if (!isActive(event, now)) continue;
    totalIds.add(event.source_id);
    if (here && haversineMeters(here, event) <= NEARBY_RADIUS_M) {
      nearbyIds.add(event.source_id);
    }
  }

  return {
    total: totalIds.size,
    nearby: here ? nearbyIds.size : null,
  };
}
