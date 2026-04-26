/**
 * Concrete `TransferGroupApi` — adapts a regular Proximity `Group` into
 * the binary-only handle that `transfer.ts → sendTransfer / receiveTransfer`
 * expects.
 *
 * Owner flow (`createTransferRoom`):
 *   - Generate a 32-byte transfer key with `crypto.getRandomValues`. Used
 *     by `sendTransfer` to AES-GCM-wrap each frame. The key is encoded
 *     into the QR alongside the join code; the group itself does not see
 *     the key.
 *   - Spin up a regular Group via `createGroup({ appSlug })`.
 *   - Wrap the Group's broadcast/on/leave surface into the binary
 *     `TransferGroupHandle`.
 *
 * Receiver flow (`joinTransferRoom`):
 *   - Take the join code + transfer key from the QR.
 *   - Spin up a Group via `joinGroup({ appSlug, joinCode })`.
 *   - Wrap the same way.
 *
 * The adapter keeps the transfer module decoupled from `group.ts` —
 * `transfer.ts` only references the structural `TransferGroupHandle`
 * shape, which means tests of `sendTransfer` / `receiveTransfer` can
 * keep using fake handles and we don't have to spin up a full WebRTC
 * stack to exercise the wire protocol.
 */
import { createGroup, joinGroup } from './group.ts';
import type { Group } from './group.ts';
import type { JoinCode, PeerId } from './types.ts';
import type { TransferGroupApi, TransferGroupHandle } from './transfer.ts';

function generateTransferKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('TransferGroupAdapter: WebCrypto unavailable');
  }
  crypto.getRandomValues(bytes);
  return bytes;
}

function asUint8(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { byteLength?: number; buffer?: ArrayBuffer };
    if (typeof candidate.byteLength === 'number' && candidate.buffer instanceof ArrayBuffer) {
      return new Uint8Array(candidate.buffer);
    }
  }
  return null;
}

function adapt(group: Group): TransferGroupHandle {
  return {
    selfId: group.selfId,
    broadcastBinary: (channel: string, bytes: Uint8Array): Promise<void> => {
      return group.broadcast(channel, bytes);
    },
    onBinary: (
      channel: string,
      handler: (bytes: Uint8Array, peerId: PeerId) => void,
    ): (() => void) => {
      return group.on(channel, (data: unknown, peerId: PeerId) => {
        const bytes = asUint8(data);
        if (bytes) handler(bytes, peerId);
      });
    },
    awaitPeer: async (timeoutMs?: number): Promise<PeerId> => {
      // Resolve as soon as the first peer beyond self is visible.
      const present = group.members();
      if (present.length > 0) return present[0]!;
      const deadline = timeoutMs && timeoutMs > 0 ? Date.now() + timeoutMs : null;
      // Poll — the alternative would be to subscribe to a membership
      // channel, but Group exposes channel-data events not membership
      // events directly. Polling at 200ms is well within the human-
      // perception window for "it's connecting".
      while (true) {
        const members = group.members();
        if (members.length > 0) return members[0]!;
        if (deadline !== null && Date.now() >= deadline) {
          throw new Error('awaitPeer timed out');
        }
        await delay(200);
      }
    },
    destroy: async (): Promise<void> => {
      group.leave();
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const transferGroupAdapter: TransferGroupApi = {
  async createTransferRoom(input: { appSlug: string }) {
    const transferKey = generateTransferKey();
    const group = await createGroup({ appSlug: input.appSlug });
    return {
      roomId: group.roomId,
      joinCode: group.joinCode,
      transferKey,
      group: adapt(group),
    };
  },
  async joinTransferRoom(input: { appSlug: string; joinCode: JoinCode; transferKey: Uint8Array }) {
    const group = await joinGroup({ appSlug: input.appSlug, joinCode: input.joinCode });
    return { group: adapt(group) };
  },
};

/**
 * Convenience re-exports — callers usually just want the bare functions.
 */
export const createTransferRoom = transferGroupAdapter.createTransferRoom;
export const joinTransferRoom = transferGroupAdapter.joinTransferRoom;
