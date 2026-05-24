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

  test('baked pack carries only offline-safe static POI categories', () => {
    const pack = loadRoutePack();
    expect(pack.pois.length).toBeGreaterThan(20);
    const kinds = new Set(pack.pois.map((poi) => poi.kind));
    // Stable quick-find categories must be present in the bake.
    for (const kind of ['toilet', 'water', 'atm']) {
      expect(kinds.has(kind as never)).toBe(true);
    }
    // Food/pub "open now" changes too fast for a static offline map.
    expect(kinds.has('food' as never)).toBe(false);
    expect(kinds.has('pub' as never)).toBe(false);
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

  test('banter carries a full chant list and expanded player poll', () => {
    const pack = loadRoutePack();
    expect(pack.banter?.chants).toHaveLength(20);
    const playerPoll = pack.banter?.polls.find((poll) => poll.id === 'player-of-season');
    expect(playerPoll?.options.some((option) => option.id === 'raya')).toBe(true);
    expect(playerPoll?.options.some((option) => option.id === 'gabriel')).toBe(true);
    expect(playerPoll?.otherOptions?.length).toBeGreaterThan(10);
  });
});
