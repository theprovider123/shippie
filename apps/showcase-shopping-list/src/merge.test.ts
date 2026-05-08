import { describe, expect, test } from 'bun:test';
import { coalesceSnapshot, mergeIncoming, type ListItem } from './merge.ts';

const NOW = 1_700_000_000_000;

describe('mergeIncoming', () => {
  test('adds new items from the meal plan', () => {
    const merged = mergeIncoming([], [{ name: 'pasta' }, { name: 'tomato' }], NOW);
    expect(merged.map((i) => i.name)).toEqual(['tomato', 'pasta']);
    expect(merged.every((i) => i.source === 'meal-plan')).toBe(true);
  });

  test('preserves existing items and their checked state', () => {
    const existing: ListItem[] = [
      { id: 'a', name: 'pasta', checked: true, source: 'manual', addedAt: '' },
    ];
    const merged = mergeIncoming(existing, [{ name: 'pasta' }], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.checked).toBe(true);
    expect(merged[0]?.source).toBe('manual');
  });

  test('matches existing items case-insensitively', () => {
    const existing: ListItem[] = [
      { id: 'a', name: 'Pasta', checked: false, source: 'manual', addedAt: '' },
    ];
    const merged = mergeIncoming(existing, [{ name: 'pasta' }], NOW);
    expect(merged).toHaveLength(1);
  });

  test('drops empty names', () => {
    const merged = mergeIncoming([], [{ name: '   ' }, { name: 'tomato' }], NOW);
    expect(merged.map((i) => i.name)).toEqual(['tomato']);
  });

  test('preserves polish-layer fields (assignee, qty, prices) on existing items', () => {
    const existing: ListItem[] = [
      {
        id: 'a',
        name: 'eggs',
        checked: false,
        source: 'manual',
        addedAt: new Date(NOW).toISOString(),
        assignee: 'Sara',
        qty: '× 6',
        prices: [{ storeId: 'tesco', pence: 240, observedAt: new Date(NOW).toISOString() }],
      },
    ];
    const merged = mergeIncoming(existing, [{ name: 'eggs' }], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.assignee).toBe('Sara');
    expect(merged[0]?.qty).toBe('× 6');
    expect(merged[0]?.prices).toHaveLength(1);
  });
});

describe('coalesceSnapshot', () => {
  const earlier = '2026-05-01T09:00:00.000Z';
  const later = '2026-05-05T09:00:00.000Z';

  test('keeps newer addedAt when both peers have the same id', () => {
    const local: ListItem[] = [
      { id: 'a', name: 'milk', checked: false, source: 'manual', addedAt: earlier },
    ];
    const incoming: ListItem[] = [
      { id: 'a', name: 'milk', checked: true, source: 'mesh', addedAt: later },
    ];
    const merged = coalesceSnapshot(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.checked).toBe(true);
  });

  test('preserves local-only items the snapshot lacks', () => {
    const local: ListItem[] = [
      { id: 'a', name: 'milk', checked: false, source: 'manual', addedAt: later },
    ];
    const incoming: ListItem[] = [
      { id: 'b', name: 'eggs', checked: false, source: 'mesh', addedAt: later },
    ];
    const merged = coalesceSnapshot(local, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((i) => i.name).sort()).toEqual(['eggs', 'milk']);
  });
});
