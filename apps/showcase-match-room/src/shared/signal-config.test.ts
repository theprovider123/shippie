import { describe, expect, test } from 'bun:test';
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
      expect(url).toBe('http://hub.local/run/match-room/?role=display&room=room-1#k=secret');
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
      expect(url).toBe('http://hub.local/run/match-room/?role=play&room=room-1&lang=es&tz=America%2FMexico_City#k=secret');
    } finally {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: previous });
    }
  });
});
