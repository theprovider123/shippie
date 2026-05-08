import { describe, expect, test } from 'bun:test';
import { diffLines, diffStats } from './diff.ts';

describe('diffLines', () => {
  test('identical inputs produce all-unchanged diff', () => {
    const out = diffLines('a\nb\nc', 'a\nb\nc');
    expect(out.every((l) => l.op === 'unchanged')).toBe(true);
    expect(out.length).toBe(3);
  });

  test('pure addition shows added lines only', () => {
    const out = diffLines('', 'new\nlines');
    const adds = out.filter((l) => l.op === 'added').map((l) => l.text);
    expect(adds).toContain('new');
    expect(adds).toContain('lines');
  });

  test('pure removal shows removed lines only', () => {
    const out = diffLines('one\ntwo\nthree', '');
    const rems = out.filter((l) => l.op === 'removed').map((l) => l.text);
    expect(rems).toEqual(['one', 'two', 'three']);
  });

  test('replacement shows removed + added', () => {
    const out = diffLines('foo\nbar', 'foo\nqux');
    const ops = out.map((l) => `${l.op}:${l.text}`);
    expect(ops).toContain('unchanged:foo');
    expect(ops).toContain('removed:bar');
    expect(ops).toContain('added:qux');
  });

  test('insertion in the middle preserves surroundings', () => {
    const out = diffLines('a\nc', 'a\nb\nc');
    const stats = diffStats(out);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(2);
  });
});

describe('diffStats', () => {
  test('counts each op type', () => {
    const lines = [
      { op: 'added' as const, text: 'x' },
      { op: 'added' as const, text: 'y' },
      { op: 'removed' as const, text: 'z' },
      { op: 'unchanged' as const, text: 'w' },
    ];
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1, unchanged: 1 });
  });
});
