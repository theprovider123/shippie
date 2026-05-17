export type {
  EncryptedGossipMessage,
  EncryptedGossipRoom,
  EventQueue,
  JoinToken,
  QueuedEvent,
  Space,
  SpaceApp,
  SpaceCapsuleV0,
  SpaceCapsulePurpose,
  SpaceManifestDeclaration,
  SpaceMember,
  SpaceParams,
  SpaceRoleDeclaration,
  SpaceRoomStatus,
  SpaceRoute,
  SpaceRouteKind,
  SpaceStatus,
} from './types.ts';

export type {
  SocialRecoveryRequest,
} from './recovery.ts';

export {
  base64ToBytes,
  base64UrlToBytes,
  base64UrlToString,
  bytesToBase64,
  bytesToBase64Url,
  decryptJson,
  deriveSpaceKey,
  encryptJson,
  randomId,
  sha256Base64Url,
  stringToBase64Url,
} from './crypto.ts';

export {
  SPACE_CAPSULE_SCHEMA,
  appendSpaceCapsuleToUrl,
  archiveSpace,
  createSpace,
  buildSpaceUrl,
  createJoinToken,
  createPortableSpaceCapsule,
  createSpaceCapsule,
  describeSpaceCapsule,
  decodeSpaceCapsule,
  encodeSpaceCapsule,
  isJoinTokenClaimable,
  readSpaceParams,
  rotateJoinToken,
} from './capsule.ts';

export {
  createEncryptedGossipRoom,
  defaultSignalBaseForRuntime,
  signalUrlFor,
} from './encrypted-gossip.ts';

export {
  createIndexedDbEventQueue,
  createMemoryEventQueue,
} from './event-queue.ts';

export {
  canRole,
  normaliseRole,
  rolePermissions,
} from './roles.ts';

export {
  canIssueSocialRecovery,
  createSocialRecoveryJoinToken,
  createSocialRecoveryRequest,
} from './recovery.ts';
