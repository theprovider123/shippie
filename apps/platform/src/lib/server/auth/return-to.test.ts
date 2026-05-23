import { describe, expect, test } from 'vitest';
import { optionalSafeReturnTo, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  test('allows local paths with query strings and hashes', () => {
    expect(safeReturnTo('/admin?sort=events#apps')).toBe('/admin?sort=events#apps');
  });

  test('rejects absolute, protocol-relative, and backslash targets', () => {
    expect(safeReturnTo('https://evil.example/admin')).toBe('/');
    expect(safeReturnTo('//evil.example/admin')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
  });

  test('optional variant returns null for absent or unsafe values', () => {
    expect(optionalSafeReturnTo(null)).toBeNull();
    expect(optionalSafeReturnTo('https://evil.example')).toBeNull();
    expect(optionalSafeReturnTo('/dashboard')).toBe('/dashboard');
  });
});
