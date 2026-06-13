import { describe, expect, it } from 'vitest';
import { clampArcadeSurface } from './arcade-surface-guard';

describe('clampArcadeSurface', () => {
  it('keeps arcade for a baked slug', () => {
    const r = clampArcadeSurface({ slug: 'snake', surface: 'arcade' });
    expect(r).toEqual({ surface: 'arcade', downgraded: false });
  });

  it('downgrades arcade → featured for a non-baked slug', () => {
    const r = clampArcadeSurface({ slug: 'my-snake-remix', surface: 'arcade' });
    expect(r).toEqual({ surface: 'featured', downgraded: true });
  });

  it('leaves non-arcade surfaces untouched regardless of slug', () => {
    expect(clampArcadeSurface({ slug: 'my-app', surface: 'featured' }).surface).toBe('featured');
    expect(clampArcadeSurface({ slug: 'my-app', surface: 'labs' }).surface).toBe('labs');
  });
});
