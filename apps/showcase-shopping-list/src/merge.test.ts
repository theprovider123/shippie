import { describe, expect, test } from 'bun:test';
import { mergeIncoming, type ListItem } from './merge.ts';

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
});
