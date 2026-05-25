import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { describeParadeLocation } from './location-labels';
import { loadBakedRoutePack } from './route-pack';

describe('parade location labels', () => {
  test('turns a coordinate into a human parade place label', () => {
    const label = describeParadeLocation({ lng: -0.1028, lat: 51.5487 }, FALLBACK_ROUTE_PACK);

    expect(label.title).toMatch(/Highbury|Drayton|Upper|Stadium/);
    expect(label.grid).toMatch(/^[A-Z]+-\d{3}$/);
    expect(label.short).toContain(label.grid);
  });

  test('includes side and nearby anchor when away from the route line', () => {
    const label = describeParadeLocation({ lng: -0.1048, lat: 51.5487 }, FALLBACK_ROUTE_PACK);

    expect(label.detail).toMatch(/side|on route/);
    expect(label.detail.length).toBeGreaterThan(4);
  });

  test('uses the active test-pack place names instead of Arsenal route labels', () => {
    const pack = loadBakedRoutePack('amsterdam-vondelpark');
    const station = pack.pois.find((poi) => poi.name === 'Amsterdam Centraal');
    expect(station).toBeDefined();

    const label = describeParadeLocation(station!, pack);
    expect(label.title).toBe('Amsterdam Centraal');
    expect(label.short).not.toContain('Drayton Park');
  });
});
