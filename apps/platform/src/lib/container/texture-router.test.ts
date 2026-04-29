import { describe, expect, test, vi } from 'vitest';
import {
  createTextureRouter,
  isTextureName,
  listBuiltinTextureNames,
} from './texture-router';

describe('texture-router — B4 bridge surface', () => {
  test('fire validates the name and forwards to the injected fireTexture', () => {
    const fire = vi.fn();
    const router = createTextureRouter({ fire });
    const result = router.fire('confirm');
    expect(result).toEqual({ fired: true, name: 'confirm' });
    expect(fire).toHaveBeenCalledWith('confirm');
  });

  test('fire rejects unknown texture names without invoking fireTexture', () => {
    const fire = vi.fn();
    const router = createTextureRouter({ fire });
    const result = router.fire('not-a-real-preset');
    expect(result).toEqual({ fired: false, reason: 'unknown_texture' });
    expect(fire).not.toHaveBeenCalled();
  });

  test('isTextureName recognises every built-in preset', () => {
    for (const name of listBuiltinTextureNames()) {
      expect(isTextureName(name)).toBe(true);
    }
  });

  test('isTextureName rejects unknown strings', () => {
    expect(isTextureName('confirm-2')).toBe(false);
    expect(isTextureName('')).toBe(false);
    expect(isTextureName('CONFIRM')).toBe(false);
  });

  test('listBuiltinTextureNames returns exactly nine presets', () => {
    expect(listBuiltinTextureNames()).toHaveLength(9);
  });

  test('all nine built-in presets fire successfully', () => {
    const fire = vi.fn();
    const router = createTextureRouter({ fire });
    for (const name of listBuiltinTextureNames()) {
      const result = router.fire(name);
      expect(result).toEqual({ fired: true, name });
    }
    expect(fire).toHaveBeenCalledTimes(9);
  });
});
