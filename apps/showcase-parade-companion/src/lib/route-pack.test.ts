import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import {
  LIVE_ROUTE_PACK_STORAGE_KEY,
  clearCachedRoutePack,
  loadBakedRoutePack,
  loadRoutePack,
  readCachedRoutePack,
  syncRoutePack,
  validateRoutePack,
  writeCachedRoutePack,
} from './route-pack';

const originalFetch = globalThis.fetch;

describe('route pack', () => {
  beforeEach(() => {
    installFakeLocalStorage();
    setNavigatorOnline(true);
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    clearCachedRoutePack();
    globalThis.fetch = originalFetch;
  });

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
    expect(pack.banter?.chants.every((chant) => chant.detail.length > 0 && !chant.detail.includes('Start:'))).toBe(true);
    const playerPoll = pack.banter?.polls.find((poll) => poll.id === 'player-of-season');
    expect(playerPoll?.options.some((option) => option.id === 'raya')).toBe(true);
    expect(playerPoll?.options.some((option) => option.id === 'gabriel')).toBe(true);
    expect(playerPoll?.otherOptions?.some((option) => option.id === 'dowman')).toBe(true);
    expect(playerPoll?.otherOptions?.length).toBeGreaterThan(10);
    const momentPoll = pack.banter?.polls.find((poll) => poll.id === 'moment-of-season');
    expect(momentPoll?.options).toHaveLength(6);
    expect(momentPoll?.options.some((option) => option.id === 'west-ham-var')).toBe(true);
    expect(pack.banter?.trivia?.length).toBeGreaterThanOrEqual(6);
    expect(pack.banter?.trivia?.every((card) => card.answerId === undefined)).toBe(true);
    expect(pack.banter?.trivia?.every((card) => card.options.length === 6)).toBe(true);
  });

  test('prefers a cached live route pack only when it is newer than the bake', () => {
    const baked = loadBakedRoutePack();
    const live = newerPack('2030-05-31T08:00:00+01:00');

    expect(writeCachedRoutePack(live)).toBe(true);

    expect(loadRoutePack().packVersion).toBe(live.packVersion);
    expect(loadRoutePack().packVersion).not.toBe(baked.packVersion);
  });

  test('ignores invalid cached live route packs', () => {
    const baked = loadBakedRoutePack();

    localStorage.setItem(LIVE_ROUTE_PACK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, packVersion: '2030' }));

    expect(readCachedRoutePack()).toBeNull();
    expect(loadRoutePack().packVersion).toBe(baked.packVersion);
  });

  test('syncRoutePack saves a newer validated pack from the live endpoint', async () => {
    const current = loadBakedRoutePack();
    const live = newerPack('2030-05-31T09:00:00+01:00');
    localStorage.setItem('parade-companion:group_plan', 'do-not-touch');
    localStorage.setItem('parade-companion:banter-votes:v1', 'do-not-touch-either');
    globalThis.fetch = mockJsonFetch(live);

    const result = await syncRoutePack('/__shippie/parade/route-pack', current);

    expect(result.status).toBe('updated');
    expect(result.pack.packVersion).toBe(live.packVersion);
    expect(readCachedRoutePack()?.packVersion).toBe(live.packVersion);
    expect(localStorage.getItem('parade-companion:group_plan')).toBe('do-not-touch');
    expect(localStorage.getItem('parade-companion:banter-votes:v1')).toBe('do-not-touch-either');
  });

  test('syncRoutePack ignores older live packs and preserves the current pack', async () => {
    const current = newerPack('2030-05-31T09:00:00+01:00');
    const stale = newerPack('2026-05-22T09:00:00+01:00');
    globalThis.fetch = mockJsonFetch(stale);

    const result = await syncRoutePack('/__shippie/parade/route-pack', current);

    expect(result.status).toBe('current');
    expect(result.pack.packVersion).toBe(current.packVersion);
    expect(readCachedRoutePack()).toBeNull();
  });

  test('syncRoutePack is quiet and non-destructive when offline or fetch fails', async () => {
    const current = loadBakedRoutePack();

    setNavigatorOnline(false);
    expect((await syncRoutePack('/__shippie/parade/route-pack', current)).status).toBe('offline');

    setNavigatorOnline(true);
    globalThis.fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    const failed = await syncRoutePack('/__shippie/parade/route-pack', current);

    expect(failed.status).toBe('failed');
    expect(failed.pack.packVersion).toBe(current.packVersion);
    expect(readCachedRoutePack()).toBeNull();
  });
});

function newerPack(packVersion: string) {
  const pack = structuredClone(FALLBACK_ROUTE_PACK);
  pack.packVersion = packVersion;
  pack.event.status = 'updated';
  return pack;
}

function mockJsonFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fake,
  });
}

function setNavigatorOnline(onLine: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine },
  });
}
