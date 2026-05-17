/**
 * Read-time helpers — the math is small but it's surface for the
 * queue card so it stays tested.
 */
import { describe, expect, test } from 'bun:test';
import {
  countWords,
  estimateMinutes,
  formatReadTime,
  formatRemaining,
  READING_WPM,
} from './read-time.ts';

describe('countWords', () => {
  test('counts whitespace-separated tokens', () => {
    expect(countWords('one two three')).toBe(3);
  });
  test('handles empty input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

describe('estimateMinutes', () => {
  test('uses 240 wpm by default', () => {
    expect(READING_WPM).toBe(240);
    expect(estimateMinutes(720)).toBe(3);
  });

  test('rounds to nearest minute', () => {
    expect(estimateMinutes(360)).toBe(2); // 1.5 → 2
    expect(estimateMinutes(120)).toBe(1);
  });

  test('returns at least 1 minute for tiny / zero / negative input', () => {
    expect(estimateMinutes(0)).toBe(1);
    expect(estimateMinutes(-10)).toBe(1);
    expect(estimateMinutes(NaN)).toBe(1);
  });
});

describe('formatReadTime', () => {
  test('formats whole minutes', () => {
    expect(formatReadTime(5)).toBe('5 min read');
    expect(formatReadTime(1)).toBe('1 min read');
  });

  test('clamps to 1 for sub-minute totals', () => {
    expect(formatReadTime(0)).toBe('1 min read');
  });
});

describe('formatRemaining', () => {
  test('returns empty for trivial progress', () => {
    expect(formatRemaining(0, 10)).toBe('');
    expect(formatRemaining(0.04, 10)).toBe('');
  });

  test('returns Done at the tail', () => {
    expect(formatRemaining(0.97, 10)).toBe('Done');
  });

  test('reports remaining minutes mid-read', () => {
    expect(formatRemaining(0.5, 10)).toBe('5 min left');
    expect(formatRemaining(0.75, 10)).toBe('3 min left'); // 2.5 → 3
  });
});
