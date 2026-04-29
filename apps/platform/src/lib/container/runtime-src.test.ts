import { describe, expect, test } from 'vitest';
import { resolveRuntimeSrc } from './runtime-src';

describe('resolveRuntimeSrc', () => {
  test('uses devUrl on localhost', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: 'http://localhost:5192', standaloneUrl: '/run/recipe/' },
        'localhost',
      ),
    ).toBe('http://localhost:5192');
  });

  test('uses same-origin /run path in production', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: 'http://localhost:5192', standaloneUrl: '/run/recipe/' },
        'shippie.app',
      ),
    ).toBe('/run/recipe/');
  });

  test('allows absolute standalone URLs for custom domains and subdomains', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: null, standaloneUrl: 'https://recipes.example.com/' },
        'shippie.app',
      ),
    ).toBe('https://recipes.example.com/');
  });

  test('returns null when no iframe-safe runtime is known', () => {
    expect(resolveRuntimeSrc({ devUrl: null, standaloneUrl: null }, 'shippie.app')).toBeNull();
  });
});
