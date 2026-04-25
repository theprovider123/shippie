import type { SensoryTexture } from '../types.ts';

export const refresh: SensoryTexture = {
  name: 'refresh',
  haptic: { pattern: [10, 20, 10] },
  sound: { kind: 'pop', freq: 520, durationMs: 90, gain: 0.35 },
  visual: { kind: 'pop', durationMs: 260 },
};
