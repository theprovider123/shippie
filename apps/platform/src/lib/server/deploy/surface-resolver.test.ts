import { describe, expect, test } from 'vitest';
import { resolveSurface } from './surface-resolver';

describe('resolveSurface', () => {
  test('first create with no signals → featured (fallback)', () => {
    const r = resolveSurface({
      manifestSurface: undefined,
      formOverride: undefined,
      existingSurface: undefined,
    });
    expect(r).toEqual({ surface: 'featured', source: 'fallback' });
  });

  test('manifest wins over form override', () => {
    const r = resolveSurface({
      manifestSurface: 'arcade',
      formOverride: 'labs',
      existingSurface: 'featured',
    });
    expect(r).toEqual({ surface: 'arcade', source: 'manifest' });
  });

  test('form override wins over existing row when manifest absent', () => {
    const r = resolveSurface({
      manifestSurface: undefined,
      formOverride: 'arcade',
      existingSurface: 'featured',
    });
    expect(r).toEqual({ surface: 'arcade', source: 'form' });
  });

  test('preserve on redeploy: existing arcade survives empty signals', () => {
    const r = resolveSurface({
      manifestSurface: undefined,
      formOverride: undefined,
      existingSurface: 'arcade',
    });
    expect(r).toEqual({ surface: 'arcade', source: 'existing' });
  });

  test('manifest can demote (arcade → featured) deliberately', () => {
    const r = resolveSurface({
      manifestSurface: 'featured',
      formOverride: undefined,
      existingSurface: 'arcade',
    });
    expect(r).toEqual({ surface: 'featured', source: 'manifest' });
  });

  test('unknown existing string falls through (defence-in-depth)', () => {
    const r = resolveSurface({
      manifestSurface: undefined,
      formOverride: undefined,
      existingSurface: 'totally-bogus-surface',
    });
    expect(r).toEqual({ surface: 'featured', source: 'fallback' });
  });

  test('labs surface picks via form when nothing else set', () => {
    const r = resolveSurface({
      manifestSurface: undefined,
      formOverride: 'labs',
      existingSurface: undefined,
    });
    expect(r).toEqual({ surface: 'labs', source: 'form' });
  });
});
