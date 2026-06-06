import { describe, expect, test } from 'bun:test';
import { monogram, accentColor, surfaceSeed } from './tool-icon';
// P0 regression: the package root MUST re-export these (consumers import
// from '@shippie/design-tokens', which resolves to ./index.ts).
import * as pkg from './index';

describe('monogram', () => {
  test('multi-word name → both initials, upper', () => {
    expect(monogram('Symptom Diary', 'symptom-diary')).toBe('SD');
    expect(monogram('Sprint Board', 'sprint-board')).toBe('SB');
  });
  test('single-word name → first two letters, title-case', () => {
    expect(monogram('Sudoku', 'sudoku')).toBe('Su');
    expect(monogram('Stitch', 'stitch')).toBe('St');
  });
  test('empty name falls back to slug initial', () => {
    expect(monogram('', 'dough')).toBe('D');
  });
  test('no name and no slug → ?', () => {
    expect(monogram('', '')).toBe('?');
  });
  test('unicode-safe (no broken surrogate halves)', () => {
    expect(Array.from(monogram('🚀rocket', 'rocket')).length).toBeGreaterThan(0);
  });
});

describe('accentColor', () => {
  test('respects a real maker theme colour', () => {
    expect(accentColor('anything', '#ff8800')).toBe('#ff8800');
  });
  test('derives from slug when theme colour is default/unset', () => {
    expect(accentColor('sudoku', '#000000')).toBe(accentColor('sudoku', null));
    expect(accentColor('sudoku', '')).toBe(accentColor('sudoku', null));
  });
  test('is stable for the same slug', () => {
    expect(accentColor('sudoku', null)).toBe(accentColor('sudoku', null));
  });
  test('same initial, different slug → different hue', () => {
    expect(accentColor('sudoku', null)).not.toBe(accentColor('symptom-diary', null));
  });
});

describe('surfaceSeed', () => {
  test('is stable and within [0,1)', () => {
    const s = surfaceSeed('sudoku');
    expect(s).toBe(surfaceSeed('sudoku'));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(1);
  });
});

describe('package index re-export (P0)', () => {
  test('monogram/accentColor/surfaceSeed are exported from ./index', () => {
    expect(typeof pkg.monogram).toBe('function');
    expect(typeof pkg.accentColor).toBe('function');
    expect(typeof pkg.surfaceSeed).toBe('function');
  });
});
