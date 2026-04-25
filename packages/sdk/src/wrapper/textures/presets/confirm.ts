import type { SensoryTexture } from '../types.ts';

export const confirm: SensoryTexture = {
  name: 'confirm',
  haptic: { pattern: 12 },
  sound: { kind: 'click', freq: 880, durationMs: 35, gain: 0.4 },
  visual: { kind: 'scale-spring', durationMs: 180 },
};
