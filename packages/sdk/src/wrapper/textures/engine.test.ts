import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  fireTexture,
  registerTexture,
  configureTextureEngine,
  _resetTextureEngineForTest,
} from './engine.ts';
import { registerBuiltinTextures, _resetBuiltinRegistrationForTest } from './index.ts';
import type { SensoryTexture, TextureName } from './types.ts';

beforeEach(() => {
  _resetTextureEngineForTest();
  // Own the scheduling primitive so CI and local Bun both run texture
  // callbacks synchronously before assertions.
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    },
  });
});

function setNavigatorVibrate(vibrate: (pattern: number | number[]) => boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { vibrate },
  });
}

describe('texture engine', () => {
  it('throws if firing an unregistered texture name', () => {
    expect(() => fireTexture('confirm')).toThrow(/no texture/i);
  });

  it('fires haptic when haptics enabled and recipe has one', () => {
    const tex: SensoryTexture = { name: 'confirm', haptic: { pattern: 12 } };
    registerTexture(tex);
    const vibrate = mock((_p: number | number[]) => true);
    setNavigatorVibrate(vibrate);
    fireTexture('confirm');
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it('skips haptic when haptics disabled', () => {
    registerTexture({ name: 'confirm', haptic: { pattern: 12 } });
    configureTextureEngine({ haptics: false });
    const vibrate = mock((_p: number | number[]) => true);
    setNavigatorVibrate(vibrate);
    fireTexture('confirm');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('skips sound when sound disabled (default)', () => {
    registerTexture({
      name: 'confirm',
      sound: { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 },
    });
    let synthCalled = false;
    fireTexture('confirm', null, {
      synthOverride: () => {
        synthCalled = true;
      },
    });
    expect(synthCalled).toBe(false);
  });

  it('runs sound when explicitly enabled', () => {
    registerTexture({
      name: 'confirm',
      sound: { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 },
    });
    configureTextureEngine({ sound: true });
    let synthCalled = false;
    fireTexture('confirm', null, {
      synthOverride: () => {
        synthCalled = true;
      },
    });
    expect(synthCalled).toBe(true);
  });

  it('skips entirely when engine disabled', () => {
    registerTexture({ name: 'confirm', haptic: { pattern: 12 } });
    configureTextureEngine({ enabled: false });
    const vibrate = mock((_p: number | number[]) => true);
    setNavigatorVibrate(vibrate);
    fireTexture('confirm');
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('builtin textures', () => {
  it('registers all 9 presets and each is fireable', () => {
    _resetTextureEngineForTest();
    _resetBuiltinRegistrationForTest();
    registerBuiltinTextures();
    const names: TextureName[] = [
      'confirm', 'complete', 'error', 'navigate', 'delete',
      'refresh', 'install', 'milestone', 'toggle',
    ];
    for (const name of names) {
      // No target → visual is a no-op; haptic/sound paths still execute under config defaults.
      expect(() => fireTexture(name)).not.toThrow();
    }
  });
});
