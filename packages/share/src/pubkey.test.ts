import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  _resetForTest,
  getDeviceName,
  getOrCreateDeviceKey,
  setDeviceName,
} from './pubkey';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeAll(() => {
  win = new Window({ url: 'https://recipe.shippie.app/' });
  (globalThis as { window?: unknown }).window = win;
  (globalThis as { localStorage?: unknown }).localStorage = win.localStorage;
});

afterEach(() => {
  _resetForTest();
});

describe('getOrCreateDeviceKey', () => {
  test('first call generates + persists', async () => {
    const key = await getOrCreateDeviceKey();
    expect(key.pubkey).toBeTruthy();
    expect(typeof key.pubkey).toBe('string');
    expect(key.privateKey).toBeTruthy();
    expect(localStorage.getItem('shippie:share:device-key')).toBeTruthy();
  });

  test('returns the same pubkey across reset (re-imported from storage)', async () => {
    const a = await getOrCreateDeviceKey();
    _resetForTest({ keepStorage: true }); // simulates a fresh page load
    expect(localStorage.getItem('shippie:share:device-key')).toBeTruthy();
    const b = await getOrCreateDeviceKey();
    expect(b.pubkey).toBe(a.pubkey);
  });

  test('cached: second call in same session returns same instance', async () => {
    const a = await getOrCreateDeviceKey();
    const b = await getOrCreateDeviceKey();
    expect(b.pubkey).toBe(a.pubkey);
    expect(b.privateKey).toBe(a.privateKey);
  });
});

describe('device name', () => {
  test('first read generates a friendly default', () => {
    const name = getDeviceName();
    expect(name).toMatch(/^[a-z]+ [a-z]+$/);
  });
  test('setDeviceName persists + reads back trimmed', () => {
    setDeviceName('  Devante  ');
    expect(getDeviceName()).toBe('Devante');
  });
  test('setDeviceName ignores empty', () => {
    setDeviceName('First');
    setDeviceName('   ');
    expect(getDeviceName()).toBe('First');
  });
});
