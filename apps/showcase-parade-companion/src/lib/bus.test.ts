import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { nearestRouteSegment } from './geo';
import { recordSighting } from './bus';

describe('bus sightings', () => {
  test('snaps a sighting to the nearest route segment', () => {
    const snap = nearestRouteSegment(
      { lng: -0.1017, lat: 51.5485 },
      FALLBACK_ROUTE_PACK.route.coordinates,
    );
    expect(snap?.segmentId).toBe('seg-3');
    expect(snap?.distanceM ?? 999).toBeLessThan(60);
  });

  test('records a local marker with segment metadata', async () => {
    const marker = await recordSighting(
      'here',
      { lng: -0.1017, lat: 51.5485, accuracyM: 22 },
      FALLBACK_ROUTE_PACK.route.coordinates,
    );
    expect(marker.source).toBe('local');
    expect(marker.segment_id).toBe('seg-3');
    expect(marker.accuracy_m).toBe(22);
  });
});
