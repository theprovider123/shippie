/**
 * The Couple Y.Doc — every piece of shared state lives in here, in
 * its own namespace.
 *
 * Persistence: y-indexeddb keeps a copy on each device.
 *
 * Cross-tab sync: BroadcastChannel between tabs on the same machine
 * (free, no infra). This gives the user a real "two devices syncing"
 * demo today: open two windows on the same laptop, both pair to the
 * same code, edits flow live.
 *
 * Cross-device sync: in production, a y-webrtc + Shippie SignalRoom
 * transport plugs in here. The Y.Doc shape doesn't change.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  decrypt,
  deriveKey,
  encrypt,
  packFrame,
  unpackFrame,
} from './crypto.ts';

export interface BoundCoupleDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  destroy: () => void;
}

/**
 * Bind the Couple Y.Doc to local persistence + an encrypted cross-tab
 * channel. Pass `coupleCode` to enable AES-GCM on relay traffic; if it
 * isn't passed, the channel still works but in plaintext (legacy mode).
 *
 * Production note: the Shippie SignalRoom DO transport plugs into the
 * same place — it must reuse `packFrame`/`unpackFrame` so the relay
 * never sees plaintext.
 */
export function bindCoupleDoc(roomId: string, coupleCode?: string): BoundCoupleDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(roomId, doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once('synced', () => resolve());
  });

  // Cross-tab sync via BroadcastChannel — same-origin only, free.
  let channel: BroadcastChannel | null = null;
  let outboundQueue: Uint8Array[] = [];
  let key: CryptoKey | null = null;
  let keyReady: Promise<void> | null = null;

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(`mev:${roomId}`);

    if (coupleCode) {
      keyReady = deriveKey(coupleCode).then((k) => {
        key = k;
        // Drain anything queued before the key arrived.
        const pending = outboundQueue;
        outboundQueue = [];
        for (const u of pending) void send(u);
      });
    }

    channel.onmessage = async (event) => {
      try {
        const data = new Uint8Array(event.data as ArrayBuffer);
        // Encrypted frames are prefixed with a 12-byte nonce. If we don't
        // have a key yet, drop the message — the sender will retry.
        if (key) {
          const frame = unpackFrame(data);
          const update = await decrypt(key, frame);
          Y.applyUpdate(doc, update, 'remote-tab');
        } else if (!coupleCode) {
          // Legacy plaintext mode for tests + back-compat.
          Y.applyUpdate(doc, data, 'remote-tab');
        }
      } catch {
        // Malformed or wrong-key — ignore. A stale tab on another room.
      }
    };

    async function send(update: Uint8Array): Promise<void> {
      if (!channel) return;
      if (!coupleCode) {
        // Plaintext fallback (only when no couple code given).
        channel.postMessage(update.buffer);
        return;
      }
      if (!key) {
        outboundQueue.push(update);
        return;
      }
      const frame = await encrypt(key, update);
      const packed = packFrame(frame);
      channel.postMessage(packed.buffer);
    }

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote-tab') return;
      void send(update);
    });
  }

  return {
    doc,
    persistence,
    whenSynced: keyReady ? Promise.all([whenSynced, keyReady]).then(() => {}) : whenSynced,
    destroy: () => {
      channel?.close();
      void persistence.destroy();
      doc.destroy();
    },
  };
}

/** Helper so component code doesn't have to import Y. */
export type { Doc as YDoc } from 'yjs';
