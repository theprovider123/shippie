import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { loadRoutePack, validateRoutePack } from './route-pack';

describe('route pack', () => {
  test('loads the baked fallback route pack', () => {
    const pack = loadRoutePack();
    expect(pack.event.startTime).toBe('2026-05-31T14:00:00+01:00');
    expect(pack.route.coordinates.length).toBeGreaterThan(1);
  });

  test('accepts a valid route pack', () => {
    expect(validateRoutePack(FALLBACK_ROUTE_PACK)?.schemaVersion).toBe(1);
  });

  test('rejects route coordinates outside the corridor', () => {
    const bad = structuredClone(FALLBACK_ROUTE_PACK);
    bad.route.coordinates = [[-1, 52], [-0.1, 51.54]];
    expect(validateRoutePack(bad)).toBeNull();
  });

  test('allows empty coordinates only when route is not final', () => {
    const routeTbd = structuredClone(FALLBACK_ROUTE_PACK);
    routeTbd.route.coordinates = [];
    routeTbd.event.status = 'route-tbd';
    expect(validateRoutePack(routeTbd)).not.toBeNull();

    const confirmed = structuredClone(routeTbd);
    confirmed.event.status = 'confirmed';
    expect(validateRoutePack(confirmed)).toBeNull();
  });

  test('baked pack carries a fine-grained practical POI library (round 8)', () => {
    const pack = loadRoutePack();
    expect(pack.pois.length).toBeGreaterThan(30);
    const kinds = new Set(pack.pois.map((poi) => poi.kind));
    // The five quick-find categories must all be present in the bake.
    for (const kind of ['toilet', 'water', 'food', 'pub', 'atm']) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });

  test('schedule rows that carry coords stay inside the corridor extent', () => {
    const pack = loadRoutePack();
    for (const row of pack.scheduleEstimate) {
      if (typeof row.lng !== 'number' || typeof row.lat !== 'number') continue;
      expect(row.lng).toBeGreaterThan(-0.125);
      expect(row.lng).toBeLessThan(-0.085);
      expect(row.lat).toBeGreaterThan(51.531);
      expect(row.lat).toBeLessThan(51.566);
    }
  });
});
