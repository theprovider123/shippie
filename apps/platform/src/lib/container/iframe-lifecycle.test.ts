/**
 * iframe-lifecycle invariants.
 *
 *   1. Focusing an already-open app moves it to the head; no
 *      eviction.
 *   2. Focusing a new app while under the cap appends; no eviction.
 *   3. Focusing a new app at the cap evicts the oldest.
 *   4. focusApp is pure — input arrays unchanged.
 */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MAX_MOUNTED,
  focusApp,
  unfocusApp,
} from './iframe-lifecycle';

describe('iframe-lifecycle — focusApp', () => {
  test('moves an already-open app to the head; no eviction', () => {
    const out = focusApp(['a', 'b', 'c'], 'b');
    expect(out.openAppIds).toEqual(['b', 'a', 'c']);
    expect(out.evicted).toBeNull();
  });

  test('appends a new app under the cap; no eviction', () => {
    const out = focusApp(['a', 'b'], 'c', 4);
    expect(out.openAppIds).toEqual(['c', 'a', 'b']);
    expect(out.evicted).toBeNull();
  });

  test('evicts the oldest when crossing the cap', () => {
    const out = focusApp(['a', 'b', 'c'], 'd', 3);
    expect(out.openAppIds).toEqual(['d', 'a', 'b']);
    expect(out.evicted).toBe('c');
  });

  test('default cap is 8', () => {
    const eight = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
    const out = focusApp(eight, 'a9');
    expect(out.openAppIds).toHaveLength(DEFAULT_MAX_MOUNTED);
    expect(out.openAppIds[0]).toBe('a9');
    expect(out.evicted).toBe('a8');
  });

  test('focusApp does not mutate its input', () => {
    const input = ['a', 'b', 'c'];
    const snapshot = [...input];
    focusApp(input, 'd', 3);
    expect(input).toEqual(snapshot);
  });
});

describe('iframe-lifecycle — unfocusApp', () => {
  test('returns the list unchanged with no eviction', () => {
    expect(unfocusApp(['a', 'b']).openAppIds).toEqual(['a', 'b']);
    expect(unfocusApp(['a', 'b']).evicted).toBeNull();
  });
});
