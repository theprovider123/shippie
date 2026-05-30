import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  installLocalStorageKeyTracker,
  readTrackedLocalStorageKeys,
  rememberTouchedLocalStorageKey,
  trackedLocalStorageKey,
} from './local-storage-tracker.ts';

const originalWindow = (globalThis as { window?: unknown }).window;
const originalStorage = (globalThis as { Storage?: unknown }).Storage;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

describe('localStorage key tracker', () => {
  let win: Window;

  beforeEach(() => {
    win = new Window();
    (globalThis as { window?: unknown }).window = win;
    (globalThis as { Storage?: unknown }).Storage = win.Storage;
    (globalThis as { localStorage?: unknown }).localStorage = win.localStorage;
  });

  afterEach(() => {
    win.close();
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { Storage?: unknown }).Storage = originalStorage;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  test('records app localStorage writes without changing app behavior', () => {
    installLocalStorageKeyTracker('palate');

    localStorage.setItem('shippie.palate.recipe-hub.v1', '{"recipes":[]}');

    expect(localStorage.getItem('shippie.palate.recipe-hub.v1')).toBe('{"recipes":[]}');
    expect(readTrackedLocalStorageKeys('palate')).toEqual(['shippie.palate.recipe-hub.v1']);
  });

  test('ignores Shippie wrapper bookkeeping keys', () => {
    installLocalStorageKeyTracker('chiwit');

    localStorage.setItem('shippie:device-hash:v1', 'private-device-hash');
    localStorage.setItem(trackedLocalStorageKey('chiwit'), '{}');
    localStorage.setItem('shippie.chiwit.daily-pulse.v1', '{"entries":[]}');

    expect(readTrackedLocalStorageKeys('chiwit')).toEqual(['shippie.chiwit.daily-pulse.v1']);
  });

  test('manual recording is bounded and de-duplicates newest first', () => {
    rememberTouchedLocalStorageKey('lift', 'one');
    rememberTouchedLocalStorageKey('lift', 'two');
    rememberTouchedLocalStorageKey('lift', 'one');

    expect(readTrackedLocalStorageKeys('lift')).toEqual(['one', 'two']);
  });
});
