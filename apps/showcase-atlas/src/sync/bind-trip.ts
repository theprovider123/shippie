/**
 * Bind a trip Y.Doc to local IndexedDB persistence + (optionally) the
 * cross-device relay. Mirrors apps/showcase-mevrouw/src/sync/couple-doc.ts
 * adapted to atlas's room semantics.
 *
 * - Persistence is keyed on `roomId` so when a peer drops, reloads,
 *   or reopens the app, the in-progress trip is still there.
 * - The relay is only attached when a passphrase is supplied. Without
 *   a passphrase we'd be relaying plaintext to the DO, which violates
 *   the threat model. Local-only mode = no passphrase = no relay.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { bindRelayProvider, type RelayProvider } from './relay-provider.ts';

export interface BoundTripDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  whenSynced: Promise<void>;
  relay: RelayProvider | null;
  destroy: () => void;
}

export interface BindTripOptions {
  roomId: string;
  /** Pass to enable cross-device sync; omit for local-only. */
  passphrase?: string;
  signalUrlBase?: string;
}

export function bindTripDoc(options: BindTripOptions): BoundTripDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`atlas:${options.roomId}`, doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once('synced', () => resolve());
  });

  let relay: RelayProvider | null = null;
  if (options.passphrase && typeof WebSocket !== 'undefined') {
    relay = bindRelayProvider({
      doc,
      roomId: options.roomId,
      passphrase: options.passphrase,
      signalUrlBase: options.signalUrlBase,
    });
  }

  return {
    doc,
    persistence,
    relay,
    whenSynced,
    destroy: () => {
      relay?.destroy();
      void persistence.destroy();
      doc.destroy();
    },
  };
}
