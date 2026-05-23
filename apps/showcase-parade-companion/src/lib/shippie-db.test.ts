import { beforeEach, describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { createFanEvent } from './fan-events';
import { clearFanEvents, listFanEvents, saveFanEvents } from './shippie-db';

const route = FALLBACK_ROUTE_PACK.route.coordinates;
const position = { lng: -0.1048, lat: 51.5487, accuracyM: 18 };

describe('shippie db fan events', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  test('prunes expired fan events and caps stored active rows', async () => {
    const active = Array.from({ length: 130 }, (_, index) =>
      createFanEvent('presence', { ...position, lng: position.lng + index * 0.000001 }, route, `fan_${index}`),
    );
    const expired = {
      ...createFanEvent('bus_seen', position, route, 'fan_expired'),
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    };

    await saveFanEvents([...active, expired]);
    const rows = await listFanEvents();

    expect(rows).toHaveLength(120);
    expect(rows.every((event) => event.id !== expired.id)).toBe(true);
    expect(readStoredFanEvents()).toHaveLength(120);
  });

  test('clear removes stored fan events', async () => {
    await saveFanEvents([createFanEvent('road_blocked', position, route, 'fan_block')]);
    expect(await listFanEvents()).toHaveLength(1);

    await clearFanEvents();

    expect(await listFanEvents()).toHaveLength(0);
  });
});

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

function readStoredFanEvents(): unknown[] {
  const raw = localStorage.getItem('parade-companion:fan_event');
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}
