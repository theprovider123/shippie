import type { GossipMessage, GossipNode, GossipPeer } from '@shippie/proximity';

export type SpaceStatus = 'active' | 'archived';
export type SpaceRouteKind = 'cloud' | 'hub' | 'peer';

export interface Space {
  id: string;
  name: string;
  createdAt: string;
  status: SpaceStatus;
  archivedAt?: string;
}

export interface SpaceApp {
  spaceId: string;
  appSlug: string;
  packageHash?: string;
}

export interface SpaceMember {
  memberId: string;
  displayName?: string;
  role: string;
  status: 'active' | 'revoked';
  joinedAt: string;
}

export interface JoinToken {
  tokenId: string;
  spaceId: string;
  role: string;
  maxClaims: number;
  claimCount: number;
  expiresAt: string;
  revokedAt?: string;
}

export interface SpaceRoute {
  kind: SpaceRouteKind;
  url?: string;
}

export interface SpaceCapsuleV0 {
  schema: 'shippie.space.capsule.v0';
  spaceId: string;
  joinToken: string;
  appSlug?: string;
  packageHash?: string;
  role: string;
  maxClaims?: number;
  expiresAt?: string;
  routes?: SpaceRoute[];
}

export interface SpaceRoleDeclaration {
  id: string;
  permissions?: string[];
}

export interface SpaceManifestDeclaration {
  enabled: boolean;
  roles?: SpaceRoleDeclaration[];
  syncMode?: 'gossip' | 'sealed-cloud' | 'hub' | 'inherited';
  archivable?: boolean;
}

export interface SpaceParams {
  spaceId: string | null;
  joinToken: string | null;
  role: string | null;
  secret: string | null;
  appSlug: string | null;
  capsule: SpaceCapsuleV0 | null;
}

export interface EncryptedGossipRoom<TPayload> {
  gossip: GossipNode<TPayload>;
  peers: () => readonly GossipPeer<TPayload>[];
  broadcast: (payload: TPayload) => Promise<boolean>;
  canRelay: () => boolean;
  status: () => SpaceRoomStatus;
  subscribe: (handler: (status: SpaceRoomStatus) => void) => () => void;
  destroy: () => void;
}

export interface SpaceRoomStatus {
  connection: 'connecting' | 'open' | 'closed';
  peerCount: number;
  lastActivity: number | null;
  error: string | null;
}

export interface QueuedEvent<TPayload = unknown> {
  id: string;
  payload: TPayload;
  createdAt: number;
}

export interface EventQueue<TPayload = unknown> {
  add(message: QueuedEvent<TPayload>): Promise<void>;
  all(): Promise<Array<QueuedEvent<TPayload>>>;
  remove(id: string): Promise<void>;
  drain(send: (message: QueuedEvent<TPayload>) => Promise<boolean>): Promise<number>;
}

export type EncryptedGossipMessage<TPayload> = GossipMessage<TPayload>;

