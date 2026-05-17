import { createEncryptedGossipRoom, type EncryptedGossipRoom } from '@shippie/spaces';
import type { MatchdayPayload, RoomStatus } from './types.ts';

export interface RelayGossipRoom {
  gossip: EncryptedGossipRoom<MatchdayPayload>['gossip'];
  peers: EncryptedGossipRoom<MatchdayPayload>['peers'];
  broadcast: (payload: MatchdayPayload) => Promise<boolean>;
  canRelay: () => boolean;
  status: () => RoomStatus;
  subscribe: (handler: (status: RoomStatus) => void) => () => void;
  destroy: () => void;
}

export function createRelayGossipRoom(opts: {
  peerId: string;
  roomId: string;
  roomKey: string;
  signalBase: string;
}): RelayGossipRoom {
  return createEncryptedGossipRoom<MatchdayPayload>({
    peerId: opts.peerId,
    spaceId: opts.roomId,
    secret: opts.roomKey,
    signalBase: opts.signalBase,
    keySalt: 'shippie-matchday:relay:v1',
    fanout: 6,
    maxHops: 10,
    dedupeWindowMs: 2 * 60_000,
  });
}
