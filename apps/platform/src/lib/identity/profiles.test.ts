import { describe, expect, it, beforeEach } from 'vitest';
import {
  PRIMARY_PROFILE_ID,
  addProfile,
  getActiveProfile,
  loadProfileState,
  removeProfile,
  saveProfileState,
  switchProfile,
} from './profiles';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('profile state', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('seeds a primary profile on first load', () => {
    const state = loadProfileState(storage);
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]!.id).toBe(PRIMARY_PROFILE_ID);
    expect(state.active).toBe(PRIMARY_PROFILE_ID);
  });

  it('save + load round-trips', () => {
    const seeded = loadProfileState(storage);
    const { state: withGuest } = addProfile(seeded, { kind: 'guest' });
    saveProfileState(withGuest, storage);
    const reloaded = loadProfileState(storage);
    expect(reloaded.profiles).toHaveLength(2);
  });

  it('addProfile defaults display name by kind', () => {
    const seeded = loadProfileState(storage);
    const { profile } = addProfile(seeded, { kind: 'kid' });
    expect(profile.displayName).toBe('Kid');
  });

  it('switchProfile updates active + lastActiveAt', () => {
    const seeded = loadProfileState(storage);
    const { state: withGuest, profile } = addProfile(seeded, { kind: 'guest' }, '2026-01-01T00:00:00Z');
    const switched = switchProfile(withGuest, profile.id, '2026-02-01T00:00:00Z');
    expect(switched.active).toBe(profile.id);
    expect(getActiveProfile(switched).lastActiveAt).toBe('2026-02-01T00:00:00Z');
  });

  it('switchProfile rejects unknown ids', () => {
    const seeded = loadProfileState(storage);
    expect(() => switchProfile(seeded, 'unknown')).toThrow(/no such profile/);
  });

  it('removeProfile drops the profile and resets active to primary', () => {
    const seeded = loadProfileState(storage);
    const { state: withGuest, profile } = addProfile(seeded, { kind: 'guest' });
    const switched = switchProfile(withGuest, profile.id);
    const removed = removeProfile(switched, profile.id);
    expect(removed.profiles).toHaveLength(1);
    expect(removed.active).toBe(PRIMARY_PROFILE_ID);
  });

  it('removeProfile refuses to remove primary', () => {
    const seeded = loadProfileState(storage);
    expect(() => removeProfile(seeded, PRIMARY_PROFILE_ID)).toThrow(/cannot remove/);
  });
});
