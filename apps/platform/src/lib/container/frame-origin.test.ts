import { describe, expect, test } from 'vitest';
import { frameBridgeOrigins, resolveFrameOrigin } from './frame-origin';

const CURRENT = 'https://shippie.app/container';

describe('resolveFrameOrigin', () => {
  test('resolves same-origin runtime paths against the current container URL', () => {
    expect(resolveFrameOrigin('/run/recipe-saver/', CURRENT)).toBe('https://shippie.app');
  });

  test('resolves dev URLs and custom domains exactly', () => {
    expect(resolveFrameOrigin('http://localhost:5192/', CURRENT)).toBe('http://localhost:5192');
    expect(resolveFrameOrigin('https://recipes.example.com/', CURRENT)).toBe('https://recipes.example.com');
  });

  test('returns null for malformed frame sources', () => {
    expect(resolveFrameOrigin('http://[bad', CURRENT)).toBeNull();
  });
});

describe('frameBridgeOrigins', () => {
  test('uses precise target and allowed origins for real runtime URLs', () => {
    expect(frameBridgeOrigins('/run/journal/', CURRENT)).toEqual({
      targetOrigin: 'https://shippie.app',
      allowedOrigin: 'https://shippie.app',
    });
  });

  test('keeps wildcard for opaque srcdoc/package frames', () => {
    expect(frameBridgeOrigins(null, CURRENT)).toEqual({ targetOrigin: '*' });
  });
});
