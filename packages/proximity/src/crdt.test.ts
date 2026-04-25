import { describe, expect, test } from 'bun:test';
import { rootArray, rootMap, SharedState } from './crdt.ts';

describe('SharedState', () => {
  test('local edits are emitted via onLocalUpdate', () => {
    const s = new SharedState({ name: 'test' });
    const updates: Uint8Array[] = [];
    s.onLocalUpdate((u) => updates.push(u));
    rootMap<string>(s, 'm').set('k', 'v');
    expect(updates.length).toBeGreaterThan(0);
    s.destroy();
  });

  test('remote applyUpdate does not echo', () => {
    const a = new SharedState({ name: 'doc' });
    const b = new SharedState({ name: 'doc' });
    const aOut: Uint8Array[] = [];
    const bOut: Uint8Array[] = [];
    a.onLocalUpdate((u) => aOut.push(u));
    b.onLocalUpdate((u) => bOut.push(u));

    rootMap<string>(a, 'm').set('hello', 'world');
    expect(aOut.length).toBeGreaterThan(0);
    const update = aOut[aOut.length - 1]!;
    b.applyUpdate(update);
    // b's listener must NOT fire — the update came from the wire.
    expect(bOut.length).toBe(0);
    expect(rootMap<string>(b, 'm').get('hello')).toBe('world');

    a.destroy();
    b.destroy();
  });

  test('state vector + encodeStateAsUpdateFromVector resync', () => {
    const a = new SharedState({ name: 'doc' });
    const b = new SharedState({ name: 'doc' });
    rootArray<number>(a, 'list').push([1, 2, 3]);

    const bv = b.stateVector();
    const diff = a.encodeStateAsUpdateFromVector(bv);
    b.applyUpdate(diff);

    expect(rootArray<number>(b, 'list').toArray()).toEqual([1, 2, 3]);

    a.destroy();
    b.destroy();
  });

  test('partitions are independent subdocs', () => {
    const s = new SharedState({ name: 'whiteboard' });
    const tile00 = s.partition('0:0');
    const tile01 = s.partition('0:1');
    expect(tile00).not.toBe(tile01);
    // Same key returns same instance.
    expect(s.partition('0:0')).toBe(tile00);
    s.destroy();
  });
});
