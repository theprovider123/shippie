import { describe, expect, test } from 'bun:test';
import { normalizeLocalPath, splitLocalPath } from './path.ts';

describe('@shippie/local-files path helpers', () => {
  test('normalizes slashes and leading roots', () => {
    expect(normalizeLocalPath('/photos/meal.jpg')).toBe('photos/meal.jpg');
    expect(normalizeLocalPath('photos\\meal.jpg')).toBe('photos/meal.jpg');
  });

  test('rejects empty and traversal paths', () => {
    expect(() => normalizeLocalPath('')).toThrow(/empty/);
    expect(() => normalizeLocalPath('../secret.txt')).toThrow(/traversal/);
    expect(() => normalizeLocalPath('photos/../secret.txt')).toThrow(/traversal/);
  });

  test('splits file paths', () => {
    expect(splitLocalPath('photos/meal.jpg')).toEqual({ dirs: ['photos'], name: 'meal.jpg' });
  });
});
