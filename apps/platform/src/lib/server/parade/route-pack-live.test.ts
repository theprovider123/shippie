import { describe, expect, test } from 'vitest';
import { parseLiveRoutePack } from './route-pack-live';

describe('live parade route pack validation', () => {
  test('accepts a valid route and normalises JSON for KV', () => {
    const result = parseLiveRoutePack(JSON.stringify(validPack()));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatchObject({
        packVersion: '2026-05-31T09:00:00+01:00',
        status: 'updated',
        poiCount: 1,
      });
      expect(result.normalized.endsWith('\n')).toBe(true);
    }
  });

  test('rejects stale-shaping mistakes before admin publish', () => {
    const pack = validPack();
    pack.pois[0].lng = -1;

    const result = parseLiveRoutePack(JSON.stringify(pack));

    expect(result).toEqual({ ok: false, error: 'POI "toilet-1" is outside the parade corridor.' });
  });
});

function validPack() {
  return {
    schemaVersion: 1,
    packVersion: '2026-05-31T09:00:00+01:00',
    event: {
      title: 'Parade Companion — Islington',
      dateLabel: 'Sunday 31 May 2026',
      startTime: '2026-05-31T14:00:00+01:00',
      status: 'updated',
    },
    sources: [{ label: 'Council update', url: 'https://example.com' }],
    route: {
      type: 'LineString',
      label: 'Updated route',
      coordinates: [
        [-0.1086, 51.5549],
        [-0.1026, 51.5421],
      ],
    },
    pois: [{ id: 'toilet-1', kind: 'toilet', name: 'Public toilet', lng: -0.103, lat: 51.546 }],
    closures: [],
    transport: { stations: [], stepFreeRoutesOut: [] },
    meetingLandmarks: [{ id: 'town-hall', label: 'Town Hall', lng: -0.1026, lat: 51.5421 }],
    safety: [],
    scheduleEstimate: [{ label: 'Start', time: '14:00', lng: -0.1086, lat: 51.5549 }],
  };
}
