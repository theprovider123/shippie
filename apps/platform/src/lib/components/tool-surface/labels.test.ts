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

describe('saveActionLabel — Save vs Refresh vs Repair', () => {
  test('Save for unsaved relationships regardless of offline state', () => {
    const relationships: Relationship[] = ['catalog', 'recent', 'running'];
    const offline: OfflineState[] = ['none', 'saving', 'ready', 'needs-refresh', 'failed'];
    for (const r of relationships) {
      for (const o of offline) {
        expect(saveActionLabel(r, o)).toBe('Save');
      }
    }
  });

  test('Save for a saved healthy tool (none/saving/ready)', () => {
    expect(saveActionLabel('saved', 'none')).toBe('Save');
    expect(saveActionLabel('saved', 'saving')).toBe('Save');
    expect(saveActionLabel('saved', 'ready')).toBe('Save');
  });

  test('Refresh for a saved tool that needs-refresh', () => {
    expect(saveActionLabel('saved', 'needs-refresh')).toBe('Refresh');
  });

  test('Repair for a saved tool whose offline copy failed', () => {
    expect(saveActionLabel('saved', 'failed')).toBe('Repair');
  });
});
