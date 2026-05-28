import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import {
  clusterFanEvents,
  createFanEvent,
  decodeFanEventsSync,
  dedupeFanEvents,
  encodeFanEventsForSync,
  eventSegmentLabel,
  isActive,
  PUBLIC_PULSE_CUTOFF_ISO,
  reportConfidenceText,
  selectCarryFanEvents,
  summarizeFanEvents,
  validateFanEvent,
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
    expect(eventSegmentLabel(event)).toMatch(/Highbury|Drayton|Upper|Stadium/);
  });

  test('keeps very wide GPS snapshots unsnapped instead of inventing a precise route point', () => {
    const event = createFanEvent('presence', { ...position, accuracyM: 900 }, route, 'fan_wide');

    expect(event.segment_id).toBeNull();
    expect(event.snapped_lng).toBeNull();
    expect(event.snapped_lat).toBeNull();
    expect(eventSegmentLabel(event)).toBe('near route');
  });

  test('accepts nearby off-map taps so users outside the schematic still see their pulse', () => {
    const nearbyOutside = createFanEvent(
      'presence',
      { lng: -0.139, lat: 51.5487, accuracyM: 24 },
      route,
      'fan_off_map',
    );
    const tooFar = createFanEvent(
      'presence',
      { lng: -0.22, lat: 51.5487, accuracyM: 24 },
      route,
      'fan_too_far',
    );

    expect(validateFanEvent(nearbyOutside)).toBe(true);
    expect(validateFanEvent(tooFar)).toBe(false);
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

  test('weights a clustered location by unique phones, not repeat taps', () => {
    const oldRepeat = createFanEvent(
      'toilet_queue',
      { lng: -0.10499, lat: 51.54865, accuracyM: 18 },
      route,
      'fan_repeat',
      new Date('2026-05-31T12:00:00+01:00'),
    );
    const latestRepeat = createFanEvent(
      'toilet_queue',
      { lng: -0.10476, lat: 51.54866, accuracyM: 18 },
      route,
      'fan_repeat',
      new Date('2026-05-31T12:01:00+01:00'),
    );
    const otherFan = createFanEvent(
      'toilet_queue',
      { lng: -0.10477, lat: 51.54867, accuracyM: 18 },
      route,
      'fan_other',
      new Date('2026-05-31T12:02:00+01:00'),
    );

    const toilet = clusterFanEvents([oldRepeat, latestRepeat, otherFan]).find((cluster) => cluster.type === 'toilet_queue');

    expect(toilet?.count).toBe(2);
    expect(toilet?.signalCount).toBe(3);
    expect(toilet?.point.lng).toBeCloseTo((-0.10476 + -0.10477) / 2, 6);
    expect(toilet?.latest.id).toBe(otherFan.id);
  });

  test('summaries cannot be boosted by repeat taps from one phone', () => {
    const rows = [
      createFanEvent('crowd_dense', position, route, 'fan_repeat', new Date('2026-05-31T12:00:00+01:00')),
      createFanEvent('crowd_dense', position, route, 'fan_repeat', new Date('2026-05-31T12:01:00+01:00')),
      createFanEvent('crowd_dense', position, route, 'fan_repeat', new Date('2026-05-31T12:02:00+01:00')),
    ];

    const summary = summarizeFanEvents(rows);

    expect(summary.activeReports[0]?.type).toBe('crowd_dense');
    expect(summary.activeReports[0]?.count).toBe(1);
    expect(summary.activeReports[0]?.confidence).toBe('single');
  });

  test('carry sync exports only the latest claim per phone, type and place', async () => {
    const oldRepeat = createFanEvent('bus_seen', position, route, 'fan_repeat', new Date('2026-05-31T12:00:00+01:00'));
    const latestRepeat = createFanEvent('bus_seen', position, route, 'fan_repeat', new Date('2026-05-31T12:01:00+01:00'));
    const otherFan = createFanEvent('bus_seen', position, route, 'fan_other', new Date('2026-05-31T12:02:00+01:00'));

    const selected = selectCarryFanEvents([oldRepeat, latestRepeat, otherFan]);
    const decoded = await decodeFanEventsSync(await encodeFanEventsForSync([oldRepeat, latestRepeat, otherFan]));

    expect(selected.map((event) => event.id).sort()).toEqual([latestRepeat.id, otherFan.id].sort());
    expect(decoded.map((event) => event.id).sort()).toEqual([latestRepeat.id, otherFan.id].sort());
  });

  test('does not carry private help taps through QR sync', async () => {
    const help = createFanEvent('need_help', position, route, 'fan_help');
    const here = createFanEvent('presence', position, route, 'fan_here');
    const selected = selectCarryFanEvents([help, here]);
    const decoded = await decodeFanEventsSync(await encodeFanEventsForSync([help, here]));

    expect(selected.map((event) => event.type)).toEqual(['presence']);
    expect(decoded.map((event) => event.type)).toEqual(['presence']);
  });

  test('renders Waze-style confidence labels without exposing raw scoring', () => {
    expect(reportConfidenceText('single', 1)).toBe('1 tap');
    expect(reportConfidenceText('likely', 3)).toBe('3 taps');
    expect(reportConfidenceText('strong', 8)).toBe('confirmed');
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

  test('caps fan pulse expiry at the parade security cutoff', () => {
    const afterCutoff = new Date(Date.parse(PUBLIC_PULSE_CUTOFF_ISO) + 60_000);
    const event = createFanEvent('presence', position, route, 'fan_late', afterCutoff);

    expect(Date.parse(event.expires_at)).toBe(Date.parse(PUBLIC_PULSE_CUTOFF_ISO));
    expect(isActive(event, afterCutoff.getTime())).toBe(false);
  });

  test('does not show active fan events after the parade security cutoff', () => {
    const beforeCutoff = new Date(Date.parse(PUBLIC_PULSE_CUTOFF_ISO) - 30 * 60_000);
    const event = createFanEvent('toilet_queue', position, route, 'fan_toilet_cutoff', beforeCutoff);

    expect(isActive(event, beforeCutoff.getTime())).toBe(true);
    expect(isActive(event, Date.parse(PUBLIC_PULSE_CUTOFF_ISO) + 1)).toBe(false);
  });
});
