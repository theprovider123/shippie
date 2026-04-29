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
  consumeEviction,
  focusApp,
  queueEviction,
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

describe('iframe-lifecycle — queueEviction / consumeEviction', () => {
  test('queueEviction with null evicted returns the same map', () => {
    const empty: ReadonlyMap<string, string> = new Map();
    const out = queueEviction(empty, 'b', null);
    expect(out.next).toBe(empty);
    expect(out.superseded).toBeNull();
  });

  test('queueEviction stores evicted under focused', () => {
    const out = queueEviction(new Map(), 'b', 'a');
    expect(out.next.get('b')).toBe('a');
    expect(out.superseded).toBeNull();
  });

  test('queueEviction with an existing entry returns the superseded id', () => {
    const initial = new Map<string, string>([['b', 'a']]);
    const out = queueEviction(initial, 'b', 'x');
    expect(out.next.get('b')).toBe('x');
    expect(out.superseded).toBe('a');
  });

  test('consumeEviction returns the evicted id + map without it', () => {
    const initial = new Map<string, string>([['b', 'a']]);
    const out = consumeEviction(initial, 'b');
    expect(out.evicted).toBe('a');
    expect(out.next.has('b')).toBe(false);
  });

  test('consumeEviction with no pending entry is a no-op', () => {
    const initial = new Map<string, string>([['b', 'a']]);
    const out = consumeEviction(initial, 'c');
    expect(out.evicted).toBeNull();
    expect(out.next).toBe(initial);
  });

  test('queue + consume round-trips with no leaked entry', () => {
    const start = new Map<string, string>();
    const queued = queueEviction(start, 'd', 'a').next;
    const consumed = consumeEviction(queued, 'd');
    expect(consumed.evicted).toBe('a');
    expect(Array.from(consumed.next.keys())).toEqual([]);
  });

  test('rapid-click flow: queue twice, only the freshest fires when the third app settles', () => {
    // User clicks d (evicts a, queued under d). Before d settles,
    // they click e (evicts b, queued under e). When d's frame fires
    // ready, dispose a. When e's settles, dispose b.
    let pending: ReadonlyMap<string, string> = new Map();
    pending = queueEviction(pending, 'd', 'a').next;
    pending = queueEviction(pending, 'e', 'b').next;
    expect(pending.get('d')).toBe('a');
    expect(pending.get('e')).toBe('b');
    const settledD = consumeEviction(pending, 'd');
    expect(settledD.evicted).toBe('a');
    const settledE = consumeEviction(settledD.next, 'e');
    expect(settledE.evicted).toBe('b');
    expect(settledE.next.size).toBe(0);
  });
});
