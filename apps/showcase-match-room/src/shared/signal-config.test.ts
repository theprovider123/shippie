import { describe, expect, test } from 'bun:test';
import { readSpaceParams } from '@shippie/spaces';
import { matchRoomUrl, signalUrlFor } from './signal-config.ts';

describe('match-room signal config', () => {
  test('signalUrlFor upgrades local http Hub endpoint to ws', () => {
    expect(signalUrlFor('http://hub.local/__shippie/signal', 'room-1')).toBe(
      'ws://hub.local/__shippie/signal/room-1',
    );
  });

  test('matchRoomUrl canonicalises old matchday path and supports display role', () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('http://hub.local/run/matchday/'),
    });
    try {
      const url = matchRoomUrl({ role: 'display', roomId: 'room-1', roomKey: 'secret' });
      const parsed = new URL(url);
      const params = readSpaceParams(url);
      expect(`${parsed.origin}${parsed.pathname}`).toBe('http://hub.local/run/match-room/');
      expect(parsed.searchParams.get('space')).toBe('room-1');
      expect(parsed.searchParams.get('role')).toBe('display');
      expect(parsed.searchParams.get('room')).toBe('room-1');
      expect(new URLSearchParams(parsed.hash.replace(/^#/, '')).get('k')).toBe('secret');
      expect(params.capsule?.purpose).toBe('open-space');
      expect(params.secret).toBe('secret');
    } finally {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: previous });
    }
  });

  test('matchRoomUrl can carry a viewer time zone', () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('http://hub.local/run/match-room/'),
    });
    try {
      const url = matchRoomUrl({
        role: 'play',
        roomId: 'room-1',
        roomKey: 'secret',
        locale: 'es',
        timeZone: 'America/Mexico_City',
      });
      const parsed = new URL(url);
      const params = readSpaceParams(url);
      expect(`${parsed.origin}${parsed.pathname}`).toBe('http://hub.local/run/match-room/');
      expect(parsed.searchParams.get('space')).toBe('room-1');
      expect(parsed.searchParams.get('role')).toBe('play');
      expect(parsed.searchParams.get('lang')).toBe('es');
      expect(parsed.searchParams.get('tz')).toBe('America/Mexico_City');
      expect(params.capsule?.purpose).toBe('join-space');
      expect(params.capsule?.appName).toBe('Match Room');
    } finally {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: previous });
    }
  });
});
