import type { SensoryTexture } from '../types.ts';

export const toggle: SensoryTexture = {
  name: 'toggle',
  haptic: { pattern: 10 },
  sound: { kind: 'click', freq: 1100, durationMs: 25, gain: 0.3 },
  visual: { kind: 'scale-spring', durationMs: 150 },
};
