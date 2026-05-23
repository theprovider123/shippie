import { beforeEach, describe, expect, test } from 'bun:test';
import {
  addSideTing,
  chipForGroupName,
  hasSideTing,
  listSideTings,
  MAX_SIDE_TINGS,
  removeSideTing,
  touchSideTing,
} from './side-tings';

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

describe('side-tings', () => {
  beforeEach(() => installFakeLocalStorage());

  test('add + list returns the new row', () => {
    const result = addSideTing({
      roomId: 'r1',
      roomKey: 'k1',
      name: 'Invincibles',
      memberCount: 5,
    });
    expect(result.ok).toBe(true);
    const rows = listSideTings();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Invincibles');
    expect(hasSideTing('r1')).toBe(true);
  });

  test('duplicate roomId rejected', () => {
    addSideTing({ roomId: 'r1', roomKey: 'k1', name: 'A', memberCount: 2 });
    const result = addSideTing({ roomId: 'r1', roomKey: 'k1', name: 'A', memberCount: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('duplicate');
    expect(listSideTings()).toHaveLength(1);
  });

  test('cap enforced at MAX_SIDE_TINGS', () => {
    for (let i = 0; i < MAX_SIDE_TINGS; i += 1) {
      addSideTing({ roomId: `r${i}`, roomKey: `k${i}`, name: `Group ${i}`, memberCount: 2 });
    }
    const overflow = addSideTing({
      roomId: 'r-extra',
      roomKey: 'k-extra',
      name: 'Extra',
      memberCount: 1,
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.reason).toBe('cap');
    expect(listSideTings()).toHaveLength(MAX_SIDE_TINGS);
  });

  test('remove drops the row', () => {
    addSideTing({ roomId: 'r1', roomKey: 'k1', name: 'One', memberCount: 2 });
    addSideTing({ roomId: 'r2', roomKey: 'k2', name: 'Two', memberCount: 2 });
    removeSideTing('r1');
    const rows = listSideTings();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roomId).toBe('r2');
  });

  test('touchSideTing updates lastSeenAt', () => {
    addSideTing({ roomId: 'r1', roomKey: 'k1', name: 'One', memberCount: 2 });
    touchSideTing('r1', '2026-05-31T14:00:00.000Z');
    expect(listSideTings()[0]?.lastSeenAt).toBe('2026-05-31T14:00:00.000Z');
  });

  test('chipForGroupName picks the next consonant', () => {
    expect(chipForGroupName('Invincibles')).toBe('IN');
    expect(chipForGroupName('Arsenal Mob')).toBe('AR');
    expect(chipForGroupName('xyz')).toBe('XY');
    expect(chipForGroupName('A')).toBe('A·');
    expect(chipForGroupName('')).toBe('··');
    expect(chipForGroupName('Aaa')).toBe('AA');
  });
});
