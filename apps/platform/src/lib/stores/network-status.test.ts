/**
 * Slow-network store: SW fallback episodes flip `isSlowNetwork` for 30s.
 * The navigator.connection branch is browser-only and guarded; these
 * tests cover the episode mechanics that work in any environment.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { isSlowNetwork, noteSlowNetworkFallback } from './network-status';

describe('isSlowNetwork', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // Drain any pending episode timer so state never leaks across tests.
    vi.runAllTimers();
    vi.useRealTimers();
  });

  test('defaults to false', () => {
    expect(get(isSlowNetwork)).toBe(false);
  });

  test('flips true on a SW fallback signal and clears after the 30s episode', () => {
    noteSlowNetworkFallback();
    expect(get(isSlowNetwork)).toBe(true);

    vi.advanceTimersByTime(29_999);
    expect(get(isSlowNetwork)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(get(isSlowNetwork)).toBe(false);
  });

  test('a fresh fallback signal extends the episode window', () => {
    noteSlowNetworkFallback();
    vi.advanceTimersByTime(20_000);
    noteSlowNetworkFallback();

    vi.advanceTimersByTime(20_000);
    expect(get(isSlowNetwork)).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(get(isSlowNetwork)).toBe(false);
  });
});
