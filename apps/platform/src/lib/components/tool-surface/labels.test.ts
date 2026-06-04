import { describe, expect, test } from 'vitest';
import { relationshipLabel, updateChipLabel, saveActionLabel } from './labels';
import type { Relationship, UpdateState, OfflineState } from './types';

describe('relationshipLabel — single source of relationship copy', () => {
  const cases: Array<[Relationship, string]> = [
    ['running', 'Open now'],
    ['recent', 'Recent'],
    ['saved', 'Saved'],
    ['catalog', ''],
  ];
  test.each(cases)('%s -> "%s"', (relationship, expected) => {
    expect(relationshipLabel(relationship)).toBe(expected);
  });
});

describe('updateChipLabel — follows UpdateState', () => {
  const cases: Array<[UpdateState, string | null]> = [
    ['update', 'Update'],
    ['needs-review', 'Review'],
    ['none', null],
  ];
  test.each(cases)('%s -> %s', (updateState, expected) => {
    expect(updateChipLabel(updateState)).toBe(expected);
  });
});

describe('saveActionLabel — Save vs Refresh vs Repair (keys off offlineState)', () => {
  test('Save for healthy offline states', () => {
    const healthy: OfflineState[] = ['none', 'saving', 'ready'];
    for (const o of healthy) {
      expect(saveActionLabel(o)).toBe('Save');
    }
  });

  test('Refresh when the offline copy needs-refresh', () => {
    expect(saveActionLabel('needs-refresh')).toBe('Refresh');
  });

  test('Repair when the offline copy failed', () => {
    expect(saveActionLabel('failed')).toBe('Repair');
  });
});
