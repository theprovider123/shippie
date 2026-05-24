import { describe, expect, test } from 'vitest';
import {
  BusPulseSegment,
  busPulseObjectName,
  fanPulseObjectName,
  summarizeBusPulse,
  validateBusPulsePacket,
  validateFanPulsePacket,
  type StoredBusPulseSighting,
} from './bus-pulse';

describe('Bus Pulse packet validation', () => {
  test('accepts a minimal anonymous segment packet', () => {
    const now = Date.parse('2026-05-31T13:45:00.000Z');
    const result = validateBusPulsePacket(
      {
        segmentId: 'seg-2',
        kind: 'here',
        accuracyM: 24.4,
        createdAt: '2026-05-31T13:44:00.000Z',
      },
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet).toMatchObject({ segmentId: 'seg-2', accuracyM: 24 });
    }
  });

  test('rejects coordinates, device ids, and other extra fields', () => {
    const now = Date.parse('2026-05-31T13:45:00.000Z');
    const result = validateBusPulsePacket(
      {
        segmentId: 'seg-2',
        kind: 'here',
        accuracyM: 24,
        createdAt: '2026-05-31T13:44:00.000Z',
        lat: 51.54,
      },
      now,
    );
    expect(result).toEqual({ ok: false, reason: 'unexpected_fields' });
  });

  test('builds one Durable Object name per route segment', () => {
    expect(busPulseObjectName('seg-4')).toBe('parade:2026-05-31:seg-4');
    expect(fanPulseObjectName('seg-4')).toBe('parade:2026-05-31:fan:seg-4');
  });
});

describe('Fan Pulse packet validation', () => {
  test('accepts an anonymous fan signal inside the corridor', () => {
    const now = Date.parse('2026-05-31T13:45:00.000Z');
    const result = validateFanPulsePacket(
      {
        id: 'presence_abc123',
        type: 'presence',
        sourceId: 'fan_abc123',
        lng: -0.1048,
        lat: 51.5487,
        accuracyM: 24.4,
        segmentId: 'seg-2',
        eventSegmentId: 'seg-2',
        eventSegmentIndex: 2,
        snappedLng: -0.1047,
        snappedLat: 51.5486,
        createdAt: '2026-05-31T13:44:00.000Z',
        expiresAt: '2026-05-31T15:44:00.000Z',
      },
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet).toMatchObject({ type: 'presence', segmentId: 'seg-2', accuracyM: 24 });
    }
  });

  test('rejects personal or unexpected fan signal fields', () => {
    const now = Date.parse('2026-05-31T13:45:00.000Z');
    const result = validateFanPulsePacket(
      {
        id: 'presence_abc123',
        type: 'presence',
        sourceId: 'fan_abc123',
        lng: -0.1048,
        lat: 51.5487,
        accuracyM: 24,
        segmentId: 'seg-2',
        eventSegmentId: 'seg-2',
        eventSegmentIndex: 2,
        snappedLng: -0.1047,
        snappedLat: 51.5486,
        createdAt: '2026-05-31T13:44:00.000Z',
        expiresAt: '2026-05-31T15:44:00.000Z',
        displayName: 'Dev',
      },
      now,
    );
    expect(result).toEqual({ ok: false, reason: 'unexpected_fields' });
  });
});

describe('Bus Pulse confidence wave', () => {
  test('requires three fresh sightings before confirmed', () => {
    const now = Date.parse('2026-05-31T14:30:00.000Z');
    const sightings = [0, 1, 2].map((minute): StoredBusPulseSighting => ({
      kind: 'here',
      accuracyM: 20,
      createdAtMs: now - minute * 60_000,
      receivedAtMs: now,
    }));

    expect(summarizeBusPulse('seg-1', sightings.slice(0, 1), now).confidence).toBe('possible');
    expect(summarizeBusPulse('seg-1', sightings, now).confidence).toBe('confirmed');
  });

  test('decays from possible to passed, then none', () => {
    const now = Date.parse('2026-05-31T14:30:00.000Z');
    const nineMinutesAgo: StoredBusPulseSighting = {
      kind: 'here',
      accuracyM: 20,
      createdAtMs: now - 9 * 60_000,
      receivedAtMs: now - 9 * 60_000,
    };
    const seventeenMinutesAgo: StoredBusPulseSighting = {
      ...nineMinutesAgo,
      createdAtMs: now - 17 * 60_000,
    };

    expect(summarizeBusPulse('seg-1', [nineMinutesAgo], now).confidence).toBe('passed');
    expect(summarizeBusPulse('seg-1', [seventeenMinutesAgo], now).confidence).toBe('none');
  });
});

describe('BusPulseSegment Durable Object', () => {
  test('stores sightings and rate-limits repeated posts from the same IP', async () => {
    const room = new BusPulseSegment(makeState(), {});
    const body = () =>
      JSON.stringify({
        segmentId: 'seg-0',
        kind: 'here',
        accuracyM: 18,
        createdAt: new Date().toISOString(),
      });

    for (let i = 0; i < 3; i += 1) {
      const res = await room.fetch(
        new Request('https://shippie.app/__shippie/parade/bus-pulse?segment=seg-0', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
          body: body(),
        }),
      );
      expect(res.status).toBe(200);
    }

    const limited = await room.fetch(
      new Request('https://shippie.app/__shippie/parade/bus-pulse?segment=seg-0', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
        body: body(),
      }),
    );
    expect(limited.status).toBe(429);

    const read = await room.fetch(
      new Request('https://shippie.app/__shippie/parade/bus-pulse?segment=seg-0'),
    );
    expect(read.status).toBe(200);
    const payload = (await read.json()) as { aggregate: { confidence: string; count: number } };
    expect(payload.aggregate).toMatchObject({ confidence: 'confirmed', count: 3 });
  });

  test('stores and returns short-lived fan signals per segment', async () => {
    const room = new BusPulseSegment(makeState(), {});
    const res = await room.fetch(
      new Request('https://fan-pulse.local/fan?segment=seg-0', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.11' },
        body: JSON.stringify({
          id: 'toilet_queue_abc123',
          type: 'toilet_queue',
          sourceId: 'fan_abc123',
          lng: -0.1048,
          lat: 51.5487,
          accuracyM: 18,
          segmentId: 'seg-0',
          eventSegmentId: null,
          eventSegmentIndex: null,
          snappedLng: null,
          snappedLat: null,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        }),
      }),
    );
    expect(res.status).toBe(200);

    const read = await room.fetch(new Request('https://fan-pulse.local/fan?segment=seg-0'));
    expect(read.status).toBe(200);
    const payload = (await read.json()) as { segmentId: string; signals: Array<{ type: string; segmentId: string }> };
    expect(payload.segmentId).toBe('seg-0');
    expect(payload.signals).toHaveLength(1);
    expect(payload.signals[0]).toMatchObject({ type: 'toilet_queue', segmentId: 'seg-0' });
  });
});

function makeState() {
  const map = new Map<string, unknown>();
  return {
    storage: {
      async get<T = unknown>(key: string) {
        return map.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T) {
        map.set(key, value);
      },
    },
  };
}
