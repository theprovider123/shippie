import { describe, expect, test } from 'bun:test';
import { matchdayUrl, signalUrlFor } from './signal-config.ts';

describe('matchday signal config', () => {
  test('signalUrlFor upgrades local http Hub endpoint to ws', () => {
    expect(signalUrlFor('http://hub.local/__shippie/signal', 'room-1')).toBe(
      'ws://hub.local/__shippie/signal/room-1',
    );
  });

  test('matchdayUrl supports display role', () => {
    const previous = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('http://hub.local/run/matchday/'),
    });
    try {
      const url = matchdayUrl({ role: 'display', roomId: 'room-1', roomKey: 'secret' });
      expect(url).toBe('http://hub.local/run/matchday/?role=display&room=room-1#k=secret');
    } finally {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: previous });
    }
  });
});
