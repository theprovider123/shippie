import { describe, expect, test } from 'bun:test';
import {
  arbitrateVenueRoles,
  preferredEndpoint,
  type VenueHubState,
} from './venue-mesh.ts';

const NOW = 1_700_000_000_000;

function hub(id: string, rank: number, freshOffsetMs = 0, url = `http://${id}:8000`): VenueHubState {
  return {
    hubId: id,
    priorityRank: rank,
    lastHeartbeatAt: NOW - freshOffsetMs,
    url,
  };
}

describe('arbitrateVenueRoles', () => {
  test('returns null primary when no hubs', () => {
    const result = arbitrateVenueRoles({ hubs: [], now: NOW });
    expect(result.primaryHubId).toBe(null);
    expect(result.secondaries).toEqual([]);
  });

  test('lowest priorityRank wins', () => {
    const result = arbitrateVenueRoles({
      hubs: [hub('a', 5), hub('b', 1), hub('c', 3)],
      now: NOW,
    });
    expect(result.primaryHubId).toBe('b');
    expect(result.secondaries).toEqual(['c', 'a']);
  });

  test('ties broken by hubId asc', () => {
    const result = arbitrateVenueRoles({
      hubs: [hub('z', 0), hub('a', 0), hub('m', 0)],
      now: NOW,
    });
    expect(result.primaryHubId).toBe('a');
    expect(result.secondaries).toEqual(['m', 'z']);
  });

  test('hubs with stale heartbeats are dropped to failed', () => {
    const result = arbitrateVenueRoles({
      hubs: [hub('a', 1, 90_000), hub('b', 2, 0)],
      now: NOW,
      heartbeatTimeoutMs: 60_000,
    });
    expect(result.primaryHubId).toBe('b');
    expect(result.failedHubs).toEqual(['a']);
  });

  test('all hubs failed → no primary', () => {
    const result = arbitrateVenueRoles({
      hubs: [hub('a', 1, 90_000), hub('b', 2, 90_000)],
      now: NOW,
      heartbeatTimeoutMs: 60_000,
    });
    expect(result.primaryHubId).toBe(null);
    expect(result.failedHubs).toEqual(['a', 'b']);
  });

  test('honours custom heartbeatTimeoutMs', () => {
    const result = arbitrateVenueRoles({
      hubs: [hub('a', 1, 1_500), hub('b', 2, 0)],
      now: NOW,
      heartbeatTimeoutMs: 1_000,
    });
    expect(result.primaryHubId).toBe('b');
    expect(result.failedHubs).toEqual(['a']);
  });
});

describe('preferredEndpoint', () => {
  test('returns the primary hub URL', () => {
    const url = preferredEndpoint({
      hubs: [hub('a', 1, 0, 'http://stage.local:8000'), hub('b', 2, 0)],
      now: NOW,
    });
    expect(url).toBe('http://stage.local:8000');
  });

  test('returns null when no hub is fresh', () => {
    const url = preferredEndpoint({
      hubs: [hub('a', 1, 90_000)],
      now: NOW,
      heartbeatTimeoutMs: 60_000,
    });
    expect(url).toBe(null);
  });

  test('returns null when there are no hubs', () => {
    expect(preferredEndpoint({ hubs: [], now: NOW })).toBe(null);
  });
});
