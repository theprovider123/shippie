import { describe, expect, test, beforeEach } from 'bun:test';
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from './useFirstRun';

const fakeStore: Storage = (() => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: () => null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  } as Storage;
})();

describe('onboarding gate', () => {
  beforeEach(() => fakeStore.clear());

  test('returns false on first run', () => {
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(false);
  });

  test('returns true after mark', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(true);
  });

  test('returns false after version bump', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    expect(hasCompletedOnboarding('chiwit', 2, fakeStore)).toBe(false);
  });

  test('reset clears the gate', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    resetOnboarding('chiwit', fakeStore);
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(false);
  });

  test('per-app isolation', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    expect(hasCompletedOnboarding('palate', 1, fakeStore)).toBe(false);
  });
});
