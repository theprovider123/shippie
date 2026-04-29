/**
 * Phase 6 — Venue mesh role arbitration.
 *
 * A venue runs multiple Hubs (stage, food court, info booth). Exactly
 * one is `primary` at any time — clients prefer it for app catalogue
 * + signalling. If the primary fails, secondaries promote
 * deterministically.
 *
 * Algorithm: lowest non-failed `priorityRank` wins. Each Hub publishes
 * its rank + last-heartbeat over the federation gossip; the winner is
 * the one every Hub agrees on.
 *
 * No election round trips, no quorum: every Hub sees the same
 * heartbeat history through gossip and computes the same answer. If
 * the network partitions, each side may elect its own primary —
 * acceptable for a venue, and they reconcile when the partition heals.
 *
 * Pure: takes a snapshot of the mesh + clock, returns the winner.
 * Tests don't need a network.
 */

export interface VenueHubState {
  hubId: string;
  /** Stable rank — lower = preferred. Tie-break by hubId asc. */
  priorityRank: number;
  /** Wall-clock ms of the most recent heartbeat we've seen for this hub. */
  lastHeartbeatAt: number;
  /** Hub URL clients use to reach it. */
  url: string;
}

export interface VenueMeshSnapshot {
  hubs: readonly VenueHubState[];
  /** Now (ms) — pure-function input so tests don't need a clock. */
  now: number;
  /** Heartbeat staleness threshold; default 60s. */
  heartbeatTimeoutMs?: number;
}

export interface VenueRoleAssignment {
  primaryHubId: string | null;
  /** Ordered fallback list (next-to-promote first). */
  secondaries: readonly string[];
  /** Hubs that haven't sent a heartbeat in `heartbeatTimeoutMs`. */
  failedHubs: readonly string[];
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 60_000;

export function arbitrateVenueRoles(snapshot: VenueMeshSnapshot): VenueRoleAssignment {
  const timeout = snapshot.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
  const fresh: VenueHubState[] = [];
  const failed: string[] = [];
  for (const hub of snapshot.hubs) {
    if (snapshot.now - hub.lastHeartbeatAt > timeout) {
      failed.push(hub.hubId);
    } else {
      fresh.push(hub);
    }
  }
  if (fresh.length === 0) {
    return { primaryHubId: null, secondaries: [], failedHubs: failed };
  }
  fresh.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return a.hubId.localeCompare(b.hubId);
  });
  const [primary, ...rest] = fresh;
  return {
    primaryHubId: primary!.hubId,
    secondaries: rest.map((h) => h.hubId),
    failedHubs: failed,
  };
}

/**
 * Compute the URL clients should hit for a given service. Returns the
 * primary's URL if available, else the next-best secondary, else null.
 */
export function preferredEndpoint(
  snapshot: VenueMeshSnapshot,
  service: 'catalog' | 'signal' = 'catalog',
): string | null {
  const roles = arbitrateVenueRoles(snapshot);
  if (!roles.primaryHubId) return null;
  const primary = snapshot.hubs.find((h) => h.hubId === roles.primaryHubId);
  if (!primary) return null;
  // service is reserved for future per-service routing (e.g. dedicated
  // signalling Hubs). Today everything goes to the primary's base URL.
  void service;
  return primary.url;
}
