import { describe, expect, test } from 'vitest';
import { resolveRuntimeSrc } from './runtime-src';

describe('resolveRuntimeSrc', () => {
  test('uses bundled internal runtime app on localhost by default', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: 'http://localhost:5192', standaloneUrl: '/run/recipe/' },
        'localhost',
      ),
    ).toBe('/__shippie-run/recipe/?shippie_embed=1');
  });

  test('uses devUrl on localhost when explicitly requested', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: 'http://localhost:5192', standaloneUrl: '/run/recipe/' },
        'localhost',
        { preferDevUrl: true },
      ),
    ).toBe('http://localhost:5192');
  });

  test('uses iframe-safe same-origin runtime path in production', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: 'http://localhost:5192', standaloneUrl: '/run/recipe/' },
        'shippie.app',
      ),
    ).toBe('/__shippie-run/recipe/?shippie_embed=1');
  });

  test('normalizes extensionless /run paths before adding embed marker', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: null, standaloneUrl: '/run/recipe' },
        'shippie.app',
      ),
    ).toBe('/__shippie-run/recipe/?shippie_embed=1');
  });

  test('forwards focused route query params into the iframe runtime', () => {
    expect(
      resolveRuntimeSrc(
        { devUrl: null, standaloneUrl: '/run/crewtrip/' },
        'shippie.app',
        { searchParams: new URLSearchParams('event=OLIVE-GROVE-10&role=crew&shippie_embed=0') },
      ),
    ).toBe('/__shippie-run/crewtrip/?event=OLIVE-GROVE-10&role=crew&shippie_embed=1');
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
