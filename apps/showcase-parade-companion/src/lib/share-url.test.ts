import { afterEach, describe, expect, test } from 'bun:test';
import { buildShareRunUrl } from './share-url';

const originalWindow = globalThis.window;

describe('share url', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
    });
  });

  test('turns localhost invites into canonical Shippie run links', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: '127.0.0.1',
          origin: 'http://127.0.0.1:5252',
        },
      },
      configurable: true,
    });

    expect(buildShareRunUrl({ fragment: '#abc123' })).toBe('https://shippie.app/run/parade-companion/#abc123');
  });

  test('preserves non-default pack ids for cross-device tests', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'localhost',
          origin: 'http://localhost:5252',
          search: '?pack=watford-vicarage',
        },
        localStorage: {
          getItem: () => null,
          setItem: () => undefined,
        },
      },
      configurable: true,
    });

    expect(buildShareRunUrl({ fragment: 'xyz', packId: 'watford-vicarage' })).toBe(
      'https://shippie.app/run/parade-companion/?pack=watford-vicarage#xyz',
    );
  });
});
