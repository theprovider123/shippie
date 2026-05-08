import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  hydrateLauncherMemory,
  launcherMemory,
  togglePinnedApp,
  type LauncherMemory,
} from './launcher-memory';

const emptyMemory: LauncherMemory = { pinned: [], recents: [], launchCounts: {} };

function installCookieDocument() {
  let cookie = '';
  vi.stubGlobal('document', {
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
    vi.unstubAllGlobals();
  });

  test('pinning updates the in-memory row even when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
    });

    togglePinnedApp('crewtrip');

    expect(get(launcherMemory).pinned).toEqual(['crewtrip']);
  });

  test('uses a cookie backup so mobile/PWA storage quirks do not lose pins', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
    });

    togglePinnedApp('crewtrip');
    launcherMemory.set(emptyMemory);
    hydrateLauncherMemory();

    expect(get(launcherMemory).pinned).toEqual(['crewtrip']);
  });
});
