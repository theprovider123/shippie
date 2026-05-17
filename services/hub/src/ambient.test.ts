import { describe, expect, test } from 'bun:test';
import { HubState } from './state.ts';
import { buildAmbientDiscovery } from './ambient.ts';

describe('Hub ambient discovery', () => {
  test('summarises visible local rooms and cached tools', () => {
    const state = new HubState();
    const now = new Date('2026-05-17T12:00:00.000Z');

    const discovery = buildAmbientDiscovery({
      hubName: 'emirates',
      origin: 'http://hub.local/',
      state,
      registry: {
        schema: 'shippie.hub.tools.v1',
        updatedAt: now.toISOString(),
        tools: [
          {
            slug: 'match-room',
            name: 'Match Room',
            version: 'v1',
            packageHash: `sha256:${'a'.repeat(64)}`,
            packageUrl: `http://hub.local/packages/sha256:${'a'.repeat(64)}.shippie`,
            appUrl: 'http://match-room.hub.local/',
            spaces: {
              enabled: true,
              roles: [{ id: 'host', permissions: ['read', 'write', 'invite'] }],
              syncMode: 'hub',
              archivable: true,
            },
            group: 'Block 5',
            deployedAt: now.toISOString(),
          },
        ],
      },
      now,
    });

    expect(discovery.schema).toBe('shippie.hub.ambient.v1');
    expect(discovery.hub).toEqual({ name: 'emirates', origin: 'http://hub.local' });
    expect(discovery.tools[0]?.slug).toBe('match-room');
    expect(discovery.tools[0]?.spaces?.enabled).toBe(true);
    expect(discovery.rooms).toEqual([]);
  });
});
