import { describe, expect, test } from 'bun:test';
import { addTag, normalizeTag, parseTags, removeTag, tagDisplay } from './tags.ts';

describe('tags · normalizeTag', () => {
  test('trims surrounding whitespace', () => {
    expect(normalizeTag('  family  ')).toBe('family');
  });

  test('collapses inner whitespace', () => {
    expect(normalizeTag('grocery   list')).toBe('grocery list');
  });

  test('strips trailing comma/semicolon', () => {
    expect(normalizeTag('errands,')).toBe('errands');
    expect(normalizeTag('errands;')).toBe('errands');
  });

  test('caps length at 32 characters', () => {
    const long = 'a'.repeat(50);
    expect(normalizeTag(long).length).toBe(32);
  });
});

describe('tags · parseTags', () => {
  test('splits comma-separated input', () => {
    expect(parseTags('family, errands, shippie')).toEqual(['family', 'errands', 'shippie']);
  });

  test('treats semicolons and newlines as separators', () => {
    expect(parseTags('a;b\nc')).toEqual(['a', 'b', 'c']);
  });

  test('drops empty entries', () => {
    expect(parseTags(' , , family,')).toEqual(['family']);
  });
});

describe('tags · addTag', () => {
  test('appends a new tag', () => {
    expect(addTag(['family'], 'errands')).toEqual(['family', 'errands']);
  });

  test('is case-insensitive on dedupe', () => {
    expect(addTag(['Family'], 'family')).toEqual(['Family']);
  });

  test('rejects empty / whitespace-only tags', () => {
    expect(addTag(['family'], '   ')).toEqual(['family']);
  });
});

describe('tags · removeTag', () => {
  test('removes a tag (case-insensitive)', () => {
    expect(removeTag(['Family', 'errands'], 'family')).toEqual(['errands']);
  });
});

describe('tags · tagDisplay', () => {
  test('joins with ", "', () => {
    expect(tagDisplay(['a', 'b', 'c'])).toBe('a, b, c');
  });
});
