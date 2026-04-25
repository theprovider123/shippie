import { describe, expect, test } from 'bun:test';
import { compileEnhanceConfigFromProfile } from './compiler.ts';

describe('compileEnhanceConfigFromProfile', () => {
  test('passes a clean profile through verbatim', () => {
    const out = compileEnhanceConfigFromProfile({
      recommended: {
        enhance: {
          'button': ['textures'],
          'video': ['wakelock'],
        },
      },
    });
    expect(out).toEqual({
      'button': ['textures'],
      'video': ['wakelock'],
    });
  });

  test('de-duplicates rules per selector', () => {
    const out = compileEnhanceConfigFromProfile({
      recommended: {
        enhance: {
          'button': ['textures', 'textures'],
          'a[href]': ['textures', 'textures', 'textures'],
        },
      },
    });
    expect(out['button']).toEqual(['textures']);
    expect(out['a[href]']).toEqual(['textures']);
  });

  test('drops selectors with empty rule arrays', () => {
    const out = compileEnhanceConfigFromProfile({
      recommended: {
        enhance: {
          'button': ['textures'],
          'span': [],
        },
      },
    });
    expect(out).toEqual({ 'button': ['textures'] });
    expect('span' in out).toBe(false);
  });

  test('preserves rule order within a selector (first wins on tie)', () => {
    const out = compileEnhanceConfigFromProfile({
      recommended: {
        enhance: {
          'video': ['wakelock', 'textures', 'wakelock'],
        },
      },
    });
    expect(out['video']).toEqual(['wakelock', 'textures']);
  });

  test('returns an empty object for an empty profile', () => {
    expect(compileEnhanceConfigFromProfile({ recommended: { enhance: {} } })).toEqual({});
  });
});
