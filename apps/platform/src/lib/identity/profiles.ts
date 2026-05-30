/**
 * On-device profiles (Tranche 4).
 *
 * A profile is a Vault keyspace + an IndexedDB / OPFS namespace.
 * Switching profile changes which device key derives the Trust
 * Ledger key, which IDB origin the apps see, and which preferences
 * apply.
 *
 * 5A foundation: pure model + active-profile resolver. The IDB
 * partitioning and `shippie.profile.switch(id)` SDK call follow as
 * separate patches once Tranche 4 wiring lands.
 *
 * No profile is ever synced to a Shippie-owned server. Profile keys
 * stay on the user's device.
 */

export type ProfileKind = 'primary' | 'guest' | 'kid' | 'secondary';

export interface ProfileRecord {
  id: string;
  kind: ProfileKind;
  /** User-supplied display name (or default per kind). */
  displayName: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of most recent switch into this profile. */
  lastActiveAt: string;
}

export const PRIMARY_PROFILE_ID = 'primary';
const STORAGE_KEY = 'shippie.profiles.v1';
const ACTIVE_KEY = 'shippie.profiles.active.v1';

interface ProfileStoreState {
  profiles: ProfileRecord[];
  active: string;
}

function safeParse(raw: string | null): ProfileStoreState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.profiles) && typeof parsed.active === 'string') {
      return parsed as ProfileStoreState;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function loadProfileState(storage: Storage = globalThis.localStorage): ProfileStoreState {
  if (!storage) return seedState();
  return safeParse(storage.getItem(STORAGE_KEY)) ?? seedState();
}

export function saveProfileState(state: ProfileStoreState, storage: Storage = globalThis.localStorage): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  storage.setItem(ACTIVE_KEY, state.active);
}

function seedState(): ProfileStoreState {
  const now = new Date().toISOString();
  return {
    profiles: [
      {
        id: PRIMARY_PROFILE_ID,
        kind: 'primary',
        displayName: 'Primary',
        createdAt: now,
        lastActiveAt: now,
      },
    ],
    active: PRIMARY_PROFILE_ID,
  };
}

export function getActiveProfile(state: ProfileStoreState): ProfileRecord {
  const active = state.profiles.find((p) => p.id === state.active);
  if (active) return active;
  // Fall back to primary if state is stale.
  return state.profiles[0] ?? seedState().profiles[0]!;
}

export function addProfile(
  state: ProfileStoreState,
  input: { kind: ProfileKind; displayName?: string },
  now: string = new Date().toISOString(),
): { state: ProfileStoreState; profile: ProfileRecord } {
  const id = `${input.kind}-${cryptoIdChunk()}`;
  const profile: ProfileRecord = {
    id,
    kind: input.kind,
    displayName: input.displayName ?? defaultName(input.kind),
    createdAt: now,
    lastActiveAt: now,
  };
  return {
    state: { ...state, profiles: [...state.profiles, profile] },
    profile,
  };
}

export function switchProfile(
  state: ProfileStoreState,
  id: string,
  now: string = new Date().toISOString(),
): ProfileStoreState {
  if (!state.profiles.some((p) => p.id === id)) {
    throw new Error(`profiles: no such profile '${id}'`);
  }
  return {
    profiles: state.profiles.map((p) => (p.id === id ? { ...p, lastActiveAt: now } : p)),
    active: id,
  };
}

export function removeProfile(state: ProfileStoreState, id: string): ProfileStoreState {
  if (id === PRIMARY_PROFILE_ID) {
    throw new Error('profiles: cannot remove the primary profile');
  }
  const remaining = state.profiles.filter((p) => p.id !== id);
  return {
    profiles: remaining,
    active: state.active === id ? PRIMARY_PROFILE_ID : state.active,
  };
}

function defaultName(kind: ProfileKind): string {
  switch (kind) {
    case 'primary':
      return 'Primary';
    case 'guest':
      return 'Guest';
    case 'kid':
      return 'Kid';
    case 'secondary':
      return 'Secondary';
  }
}

function cryptoIdChunk(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().split('-')[0]!;
  }
  return Math.random().toString(36).slice(2, 10);
}
