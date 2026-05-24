import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import {
  clusterFanEvents,
  createFanEvent,
  decodeFanEventsSync,
  dedupeFanEvents,
  encodeFanEventsForSync,
  eventSegmentLabel,
  summarizeFanEvents,
} from './fan-events';

const route = FALLBACK_ROUTE_PACK.route.coordinates;
const position = { lng: -0.1048, lat: 51.5487, accuracyM: 18 };

describe('fan events', () => {
  test('creates a route-snapped local signal', () => {
    const event = createFanEvent('bus_seen', position, route, 'fan_test');
    expect(event.type).toBe('bus_seen');
    expect(event.source).toBe('local');
    expect(event.segment_id).toMatch(/^seg-/);
    expect(typeof event.snapped_lng).toBe('number');
    expect(typeof event.snapped_lat).toBe('number');
    expect(eventSegmentLabel(event).startsWith('stretch ')).toBe(true);
  });

  test('keeps very wide GPS snapshots unsnapped instead of inventing a precise route point', () => {
    const event = createFanEvent('presence', { ...position, accuracyM: 900 }, route, 'fan_wide');

    expect(event.segment_id).toBeNull();
    expect(event.snapped_lng).toBeNull();
    expect(event.snapped_lat).toBeNull();
    expect(eventSegmentLabel(event)).toBe('near route');
  });

  test('summarizes active presence, reports, and carried phones', () => {
    const here = createFanEvent('presence', position, route, 'fan_a');
    const carried = { ...createFanEvent('presence', position, route, 'fan_b'), source: 'nearby_sync' as const };
    const report = createFanEvent('crowd_dense', position, route, 'fan_c');
    const summary = summarizeFanEvents([here, carried, report]);

    expect(summary.hereCount).toBe(2);
    expect(summary.carriedPhones).toBe(1);
    expect(summary.totalSignals).toBe(3);
    expect(summary.activeReports[0]?.type).toBe('crowd_dense');
    expect(summary.activeReports[0]?.confidence).toBe('single');
  });

  test('round-trips through QR fragment and imports as nearby sync', async () => {
    const events = [
      createFanEvent('presence', position, route, 'fan_a'),
      createFanEvent('road_blocked', position, route, 'fan_b'),
      createFanEvent('food_open', { ...position, lng: -0.1042, lat: 51.5421 }, route, 'fan_c'),
    ];
    const fragment = await encodeFanEventsForSync(events);
    const decoded = await decodeFanEventsSync(fragment);

    expect(decoded).toHaveLength(3);
    expect(decoded.every((event) => event.source === 'nearby_sync')).toBe(true);
    expect(decoded.map((event) => event.type).sort()).toEqual(['food_open', 'presence', 'road_blocked']);
  });

  test('open food and toilet-here reports stay at the GPS point instead of snapping to the route', () => {
    const food = createFanEvent('food_open', position, route, 'fan_food');
    const queue = createFanEvent('toilet_queue', position, route, 'fan_toilet');
    const summary = summarizeFanEvents([food, queue]);

    expect(food.segment_id).toBeNull();
    expect(food.snapped_lng).toBeNull();
    expect(queue.segment_id).toBeNull();
    expect(summary.activeReports.map((report) => report.type)).toEqual(['food_open', 'toilet_queue']);
  });

  test('ignores expired events and dedupes by id', () => {
    const fresh = createFanEvent('need_help', position, route, 'fan_a');
    const expired = {
      ...createFanEvent('bus_seen', position, route, 'fan_b'),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    const duplicate = { ...fresh, created_at: new Date(Date.now() - 1000).toISOString() };
    const deduped = dedupeFanEvents([fresh, expired, duplicate]);
    const summary = summarizeFanEvents(deduped);

    expect(deduped).toHaveLength(2);
    expect(summary.latestBus).toBeNull();
    expect(summary.activeReports[0]?.type).toBe('need_help');
  });

  test('groups nearby pings into one live map location per route stretch and type', () => {
    const events = [
      createFanEvent('presence', position, route, 'fan_a'),
      createFanEvent('presence', { ...position, lng: -0.10481, lat: 51.54871 }, route, 'fan_b'),
      createFanEvent('crowd_dense', position, route, 'fan_c'),
    ];
    const clusters = clusterFanEvents(events);
    const presence = clusters.find((cluster) => cluster.type === 'presence');
    const crowd = clusters.find((cluster) => cluster.type === 'crowd_dense');

    expect(presence?.count).toBe(2);
    expect(presence?.signalCount).toBe(2);
    expect(presence?.segmentId).toMatch(/^seg-/);
    expect(crowd?.count).toBe(1);
    expect(crowd?.segmentId).toBe(presence?.segmentId);
  });

  test('does not let one phone inflate a grouped live location', () => {
    const events = [
      createFanEvent('road_blocked', position, route, 'fan_repeat'),
      createFanEvent('road_blocked', { ...position, lng: -0.10482 }, route, 'fan_repeat'),
      createFanEvent('road_blocked', { ...position, lng: -0.10483 }, route, 'fan_other'),
    ];
    const blocked = clusterFanEvents(events).find((cluster) => cluster.type === 'road_blocked');

    expect(blocked?.count).toBe(2);
    expect(blocked?.signalCount).toBe(3);
    expect(blocked?.confidence).toBe('single');
  });

  test('drops expired pings from live map clusters', () => {
    const fresh = createFanEvent('need_help', position, route, 'fan_a');
    const expired = {
      ...createFanEvent('need_help', position, route, 'fan_b'),
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    };

    const help = clusterFanEvents([fresh, expired]).find((cluster) => cluster.type === 'need_help');

    expect(help?.count).toBe(1);
    expect(help?.latest.id).toBe(fresh.id);
  });
});
