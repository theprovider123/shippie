/**
 * Yjs wrapper with subdoc partitioning.
 *
 * `group.sharedState(name)` returns a `SharedState` instance that
 * exposes the underlying `Y.Doc` plus a partitioning helper. Big state
 * (e.g. the whiteboard's full stroke history) lives in subdocs that
 * load lazily — the visible region is hydrated first, the rest backfills
 * on idle.
 *
 * We expose update encoding/decoding so the transport layer in
 * `group.ts` can pipe Yjs deltas through the encryption envelope.
 */
import * as Y from 'yjs';

export interface SharedStateOptions {
  /** Name — used as the doc guid + key. */
  name: string;
}

export class SharedState {
  readonly name: string;
  readonly doc: Y.Doc;
  private subdocs = new Map<string, Y.Doc>();
  private updateListeners = new Set<(update: Uint8Array, origin: unknown) => void>();

  constructor(opts: SharedStateOptions) {
    this.name = opts.name;
    this.doc = new Y.Doc({ guid: opts.name });
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Ignore updates that came from the wire (origin === 'remote') to
      // prevent loops — the network listener tags applied updates.
      if (origin === 'remote') return;
      for (const fn of this.updateListeners) fn(update, origin);
    });
  }

  /**
   * Get or create a partition (subdoc). Use partitions when state is
   * naturally chunkable (e.g. tile coords on a whiteboard, day buckets
   * in a journal). Each partition syncs independently.
   */
  partition(key: string): Y.Doc {
    let sub = this.subdocs.get(key);
    if (!sub) {
      sub = new Y.Doc({ guid: `${this.name}/${key}` });
      this.subdocs.set(key, sub);
      const map = this.doc.getMap('subdocs');
      this.doc.transact(() => {
        if (!map.has(key)) map.set(key, sub);
      });
    }
    return sub;
  }

  /** Subscribe to local updates that should be broadcast. */
  onLocalUpdate(handler: (update: Uint8Array) => void): () => void {
    const wrapped = (update: Uint8Array) => handler(update);
    this.updateListeners.add(wrapped);
    return () => {
      this.updateListeners.delete(wrapped);
    };
  }

  /** Apply a remote update — flagged with 'remote' so we don't echo it. */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, 'remote');
  }

  /** Encode the full state for initial sync. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Encode just the missing-from-vector for incremental resync. */
  encodeStateAsUpdateFromVector(stateVector: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, stateVector);
  }

  /** Local state vector — send this to a peer to ask for the diff. */
  stateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  /** Free all resources. */
  destroy() {
    this.updateListeners.clear();
    for (const sub of this.subdocs.values()) sub.destroy();
    this.subdocs.clear();
    this.doc.destroy();
  }
}

/**
 * Helper: bind a `Y.Map` to the doc's root with a typed accessor. The
 * caller still talks Yjs API for fine-grained edits — this is just a
 * convenience for "give me the top-level map by name".
 */
export function rootMap<T>(state: SharedState, name: string): Y.Map<T> {
  return state.doc.getMap<T>(name);
}

export function rootArray<T>(state: SharedState, name: string): Y.Array<T> {
  return state.doc.getArray<T>(name);
}
