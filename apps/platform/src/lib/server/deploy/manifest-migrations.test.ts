import { describe, expect, test } from 'vitest';
import { parseMigrations } from './manifest';

describe('parseMigrations', () => {
  test('returns undefined for null / non-object', () => {
    expect(parseMigrations(null)).toBeUndefined();
    expect(parseMigrations(undefined)).toBeUndefined();
    expect(parseMigrations('string')).toBeUndefined();
    expect(parseMigrations(42)).toBeUndefined();
  });

  test('returns undefined for empty object', () => {
    expect(parseMigrations({})).toBeUndefined();
  });

  test('extracts valid rename entries', () => {
    const result = parseMigrations({ rename: { old_title: 'name', another: 'one' } });
    expect(result?.rename).toEqual({ old_title: 'name', another: 'one' });
  });

  test('drops rename entries with invalid identifiers', () => {
    const result = parseMigrations({
      rename: {
        valid: 'ok',
        'with-dash': 'bad', // bad column name
        good: 'with space', // bad target name
      },
    });
    expect(result?.rename).toEqual({ valid: 'ok' });
  });

  test('extracts valid drop list', () => {
    const result = parseMigrations({ drop: ['old_a', 'old_b', 'has-dash', 42] });
    expect(result?.drop).toEqual(['old_a', 'old_b']);
  });

  test('extracts valid transform map', () => {
    const result = parseMigrations({
      transform: {
        old: { to: 'new', copy: true },
        another: { to: 'thing' },
      },
    });
    expect(result?.transform).toEqual({
      old: { to: 'new', copy: true },
      another: { to: 'thing', copy: undefined },
    });
  });

  test('drops transform entries missing `to` or with bad names', () => {
    const result = parseMigrations({
      transform: {
        good: { to: 'fine' },
        no_target: { copy: true },
        bad_name: 'string-not-object',
        valid: { to: 'has-dash' },
      },
    });
    expect(result?.transform).toEqual({ good: { to: 'fine', copy: undefined } });
  });

  test('combines all three fields', () => {
    const result = parseMigrations({
      rename: { a: 'b' },
      drop: ['c'],
      transform: { d: { to: 'e' } },
    });
    expect(result?.rename).toEqual({ a: 'b' });
    expect(result?.drop).toEqual(['c']);
    expect(result?.transform).toEqual({ d: { to: 'e', copy: undefined } });
  });
});
