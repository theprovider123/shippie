/**
 * Container — mesh status state.
 *
 * Phase B2 surface. The container's topbar badge ("📡 N nearby") reads
 * from this state holder; the actual `@shippie/proximity` Group is owned
 * by the Svelte page and pushes status transitions in.
 *
 * Why a state holder and not a direct proximity import: the topbar
 * shouldn't carry the proximity bundle, the Group shouldn't be torn
 * down on every render, and the Svelte component must drive the
 * lifecycle (create / join / leave). The state holder just pins the
 * shape for the badge and keeps the proximity dependency dynamic.
 */

export type MeshStatus =
  | { state: 'idle' }
  | { state: 'connecting'; roomId: string }
  | { state: 'connected'; roomId: string; peerCount: number; joinCode: string }
  | { state: 'error'; message: string };

export interface MeshStatusStore {
  current(): MeshStatus;
  set(next: MeshStatus): void;
  subscribe(listener: (status: MeshStatus) => void): () => void;
}

export function createMeshStatusStore(initial: MeshStatus = { state: 'idle' }): MeshStatusStore {
  let value: MeshStatus = initial;
  const listeners = new Set<(status: MeshStatus) => void>();
  return {
    current: () => value,
    set(next: MeshStatus) {
      value = next;
      for (const l of listeners) l(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function meshBadgeLabel(status: MeshStatus): string | null {
  switch (status.state) {
    case 'idle':
      return null;
    case 'connecting':
      return 'connecting…';
    case 'connected':
      return `📡 ${status.peerCount} nearby`;
    case 'error':
      return 'mesh error';
  }
}
