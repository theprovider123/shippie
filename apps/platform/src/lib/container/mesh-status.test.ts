import { describe, expect, test, vi } from 'vitest';
import {
  createMeshStatusStore,
  meshBadgeLabel,
  type MeshStatus,
} from './mesh-status';

describe('createMeshStatusStore — B2 mesh state', () => {
  test('starts idle by default', () => {
    const store = createMeshStatusStore();
    expect(store.current()).toEqual({ state: 'idle' });
  });

  test('honors an explicit initial value', () => {
    const initial: MeshStatus = { state: 'connecting', roomId: 'r1' };
    const store = createMeshStatusStore(initial);
    expect(store.current()).toEqual(initial);
  });

  test('set updates current and notifies subscribers', () => {
    const store = createMeshStatusStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ state: 'connected', roomId: 'r1', peerCount: 3, joinCode: 'AB12CD34' });
    expect(store.current()).toEqual({
      state: 'connected',
      roomId: 'r1',
      peerCount: 3,
      joinCode: 'AB12CD34',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('unsubscribed listeners no longer receive updates', () => {
    const store = createMeshStatusStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ state: 'connecting', roomId: 'r1' });
    off();
    store.set({ state: 'idle' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('multiple listeners are all notified', () => {
    const store = createMeshStatusStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.set({ state: 'idle' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('meshBadgeLabel — B2 topbar badge', () => {
  test('idle hides the badge (null label)', () => {
    expect(meshBadgeLabel({ state: 'idle' })).toBe(null);
  });

  test('connecting shows a transient label', () => {
    expect(meshBadgeLabel({ state: 'connecting', roomId: 'r1' })).toBe('connecting…');
  });

  test('connected shows the peer count with the radar pictogram', () => {
    expect(
      meshBadgeLabel({ state: 'connected', roomId: 'r1', peerCount: 3, joinCode: 'AB12CD34' }),
    ).toBe('📡 3 nearby');
    expect(
      meshBadgeLabel({ state: 'connected', roomId: 'r1', peerCount: 0, joinCode: 'AB12CD34' }),
    ).toBe('📡 0 nearby');
  });

  test('error renders an error label', () => {
    expect(meshBadgeLabel({ state: 'error', message: 'signal_failed' })).toBe('mesh error');
  });
});
