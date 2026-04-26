/**
 * @shippie/proximity — Local Groups SDK + Proximity Protocol client.
 *
 * Public API:
 *
 *   import { createGroup, joinGroup } from '@shippie/proximity';
 *
 *   const owner = await createGroup({ appSlug: 'whiteboard' });
 *   // share owner.joinCode via QR
 *
 *   const guest = await joinGroup({ appSlug: 'whiteboard', joinCode });
 *
 *   const strokes = guest.sharedState('strokes');
 *   strokes.doc.getArray('list').push([{ x: 10, y: 20 }]);
 *
 *   const chat = guest.eventLog<string>('chat');
 *   chat.append('hi');
 *   chat.onEntry((e) => console.log(e.author, e.data));
 *
 * Wire-level architecture: see ./group.ts top comment.
 */
export { createGroup, joinGroup } from './group.ts';
export type { Group, GroupState } from './group.ts';

export {
  sendTransfer,
  receiveTransfer,
  encryptFrame,
  decryptFrame,
  TRANSFER_CHANNEL,
} from './transfer.ts';
export {
  transferGroupAdapter,
  createTransferRoom,
  joinTransferRoom,
} from './transfer-group-adapter.ts';
export type {
  SendTransferOptions,
  SendTransferResult,
  ReceiveTransferOptions,
  ReceiveTransferResult,
  TransferGroupApi,
  TransferGroupHandle,
  TransferEvent,
  TransferListener,
  TransferSnapshot,
  TransferFrame,
} from './transfer.ts';

export { SharedState, rootArray, rootMap } from './crdt.ts';
export { EventLog, compareClocks, compareEntries } from './eventlog.ts';

export { deriveRoomId, generateJoinCode, normalizeIp } from './room-id.ts';
export { discoverPublicIp, isPrivateAddress, parseSrflxIp } from './stun.ts';

export {
  generateEphemeralKeyPair,
  importPeerPublicKey,
  deriveSharedAesKey,
  deriveHandshakeSalt,
} from './handshake.ts';
export type { HandshakeKeyPair, HandshakeResult } from './handshake.ts';

export {
  generateSigningKeyPair,
  importPeerSigningKey,
  encryptEnvelope,
  decryptEnvelope,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
} from './encryption.ts';
export type { SigningKeyPair } from './encryption.ts';

export { SignalClient, buildSignalUrl } from './client.ts';
export type { SignalClientOptions } from './client.ts';

export { PeerLink } from './webrtc.ts';
export type { PeerLinkOptions, PeerLinkState, PeerSignal } from './webrtc.ts';

export type {
  CreateGroupOptions,
  JoinGroupOptions,
  EncryptedEnvelope,
  EventHandler,
  JoinCode,
  LogEntry,
  PeerId,
  RoomId,
  SignalAnswer,
  SignalHello,
  SignalIce,
  SignalMessage,
  SignalOffer,
  SignalPeerJoined,
  SignalPeerLeft,
  VectorClock,
} from './types.ts';
