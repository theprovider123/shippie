import type { HubState } from './state.ts';
import type { HubToolRegistry } from './packages.ts';

export interface HubAmbientDiscovery {
  schema: 'shippie.hub.ambient.v1';
  hub: {
    name: string;
    origin: string;
  };
  updatedAt: string;
  rooms: Array<{
    roomId: string;
    peerCount: number;
    lastActivityMs: number;
  }>;
  tools: HubToolRegistry['tools'];
}

export function buildAmbientDiscovery(input: {
  hubName: string;
  origin: string;
  state: HubState;
  registry: HubToolRegistry;
  now?: Date;
}): HubAmbientDiscovery {
  return {
    schema: 'shippie.hub.ambient.v1',
    hub: {
      name: input.hubName,
      origin: input.origin.replace(/\/+$/, ''),
    },
    updatedAt: (input.now ?? new Date()).toISOString(),
    rooms: input.state.stats().map((room) => ({
      roomId: room.roomId,
      peerCount: room.peerCount,
      lastActivityMs: room.lastActivityMs,
    })),
    tools: input.registry.tools,
  };
}
