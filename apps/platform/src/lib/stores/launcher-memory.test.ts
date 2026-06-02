import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import {
  clearLauncherMemory,
  hydrateLauncherMemory,
  launcherMemory,
  removeSavedApp,
  saveAppToDock,
  toggleSavedApp,
  togglePinnedApp,
  type LauncherMemory,
} from './launcher-memory';

const emptyMemory: LauncherMemory = { saved: [], pinned: [], recents: [], launchCounts: {} };
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubGlobal(name: 'document' | 'localStorage', value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobal(name: 'document' | 'localStorage', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[name];
  }
}

function installCookieDocument() {
  let cookie = '';
  stubGlobal('document', {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value.split(';')[0] ?? '';
    },
  });
}

describe('launcher memory', () => {
  beforeEach(() => {
    launcherMemory.set(emptyMemory);
    installCookieDocument();
  });

  afterEach(() => {
    launcherMemory.set(emptyMemory);
    restoreGlobal('document', originalDocumentDescriptor);
    restoreGlobal('localStorage', originalLocalStorageDescriptor);
  });

  test('saving updates the in-memory row even when localStorage throws', () => {
    stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
    });

    saveAppToDock('crewtrip');

    expect(get(launcherMemory).saved).toEqual(['crewtrip']);
    expect(get(launcherMemory).pinned).toEqual(['crewtrip']);
  });

  test('uses a cookie backup so mobile/PWA storage quirks do not lose saved tools', () => {
    stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
    });

    saveAppToDock('crewtrip');
    launcherMemory.set(emptyMemory);
    hydrateLauncherMemory();

    expect(get(launcherMemory).saved).toEqual(['crewtrip']);
  });

  test('migrates legacy pinned tools into saved', () => {
    stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ pinned: ['crewtrip'], recents: [], launchCounts: {} }),
      setItem: () => {},
    });

    hydrateLauncherMemory();

    expect(get(launcherMemory).saved).toEqual(['crewtrip']);
    expect(get(launcherMemory).pinned).toEqual(['crewtrip']);
  });

  test('does not drop legacy pinned tools when saved exists but is empty', () => {
    stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ saved: [], pinned: ['crewtrip'], recents: [], launchCounts: {} }),
      setItem: () => {},
    });

    hydrateLauncherMemory();

    expect(get(launcherMemory).saved).toEqual(['crewtrip']);
    expect(get(launcherMemory).pinned).toEqual(['crewtrip']);
  });

  test('migrates legacy launchedAt recents into lastOpened recents', () => {
    stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          saved: [],
          pinned: [],
          recents: [{ slug: 'crewtrip', launchedAt: 1_796_163_840_000 }],
          launchCounts: {},
        }),
      setItem: () => {},
    });

    hydrateLauncherMemory();

    expect(get(launcherMemory).recents).toEqual([
      { slug: 'crewtrip', lastOpened: '2026-12-01T22:24:00.000Z' },
    ]);
  });

  test('togglePinnedApp remains a compatibility alias for saved', () => {
    togglePinnedApp('crewtrip');
    expect(get(launcherMemory).saved).toEqual(['crewtrip']);
    toggleSavedApp('crewtrip');
    expect(get(launcherMemory).saved).toEqual([]);
  });

  test('removes saved tools without touching recents', () => {
    launcherMemory.set({
      saved: ['crewtrip'],
      pinned: ['crewtrip'],
      recents: [{ slug: 'crewtrip', lastOpened: new Date().toISOString() }],
      launchCounts: { crewtrip: 2 },
    });

    removeSavedApp('crewtrip');

    expect(get(launcherMemory).saved).toEqual([]);
    expect(get(launcherMemory).recents).toHaveLength(1);
  });

  test('can clear local launcher memory', () => {
    launcherMemory.set({
      saved: ['crewtrip'],
      pinned: ['crewtrip'],
      recents: [{ slug: 'crewtrip', lastOpened: new Date().toISOString() }],
      launchCounts: { crewtrip: 2 },
    });

    clearLauncherMemory();

    expect(get(launcherMemory)).toEqual(emptyMemory);
  });
});
