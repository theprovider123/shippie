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
});
