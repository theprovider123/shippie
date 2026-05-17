import { describe, expect, test } from 'bun:test';
import { newVersionId, restore, snapshot, sortVersions } from './versions.ts';
import type { Section } from './store.ts';

const SECTIONS: Section[] = [
  { id: 's1', pitch_id: 'p1', kind: 'problem', title: 'Problem', body_md: 'old text', order: 0 },
  { id: 's2', pitch_id: 'p1', kind: 'solution', title: 'Solution', body_md: '', order: 1 },
];

describe('versions · snapshot', () => {
  test('captures all sections', () => {
    const v = snapshot('p1', SECTIONS, 'v1');
    expect(v.pitch_id).toBe('p1');
    expect(v.label).toBe('v1');
    expect(v.sections).toHaveLength(2);
    expect(v.sections[0]?.body_md).toBe('old text');
  });

  test('default label uses ISO timestamp prefix', () => {
    const v = snapshot('p1', SECTIONS);
    // 16 chars: YYYY-MM-DD HH:mm
    expect(v.label).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test('snapshots are decoupled from live edits', () => {
    const sections: Section[] = [{ ...SECTIONS[0]! }];
    const v = snapshot('p1', sections);
    sections[0]!.body_md = 'mutated after snapshot';
    expect(v.sections[0]?.body_md).toBe('old text');
  });
});

describe('versions · restore', () => {
  test('restore returns a deep copy of the snapshot', () => {
    const v = snapshot('p1', SECTIONS);
    const restored = restore(v);
    expect(restored).toHaveLength(2);
    expect(restored).not.toBe(v.sections);
    restored[0]!.body_md = 'changed';
    expect(v.sections[0]?.body_md).toBe('old text');
  });
});

describe('versions · sortVersions', () => {
  test('sorts newest first', () => {
    const a = { ...snapshot('p1', SECTIONS, 'a'), created_at: '2026-01-01T00:00:00Z' };
    const b = { ...snapshot('p1', SECTIONS, 'b'), created_at: '2026-02-01T00:00:00Z' };
    const c = { ...snapshot('p1', SECTIONS, 'c'), created_at: '2026-03-01T00:00:00Z' };
    const out = sortVersions([a, c, b]);
    expect(out.map((v) => v.label)).toEqual(['c', 'b', 'a']);
  });
});

describe('versions · ids', () => {
  test('newVersionId returns unique-ish ids', () => {
    const a = newVersionId();
    const b = newVersionId();
    expect(a).not.toBe(b);
    expect(a.startsWith('ver_')).toBe(true);
  });
});
