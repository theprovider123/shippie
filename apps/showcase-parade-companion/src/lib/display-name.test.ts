import { beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanDisplayName,
  DEFAULT_DISPLAY_NAME,
  getDisplayName,
  hasDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
  setDisplayName,
} from './display-name';

function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe('display-name', () => {
  beforeEach(() => installFakeLocalStorage());

  test('cleans whitespace and falls back to Me', () => {
    expect(cleanDisplayName('  Bukayo   Saka  ')).toBe('Bukayo Saka');
    expect(cleanDisplayName('')).toBe(DEFAULT_DISPLAY_NAME);
  });

  test('caps long names', () => {
    expect(cleanDisplayName('A'.repeat(80))).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  test('persists locally', () => {
    expect(hasDisplayName()).toBe(false);
    expect(setDisplayName(' Leah ')).toBe('Leah');
    expect(getDisplayName()).toBe('Leah');
    expect(hasDisplayName()).toBe(true);
  });
});
