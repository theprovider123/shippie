import type { SensoryTexture } from '../types.ts';

export const navigate: SensoryTexture = {
  name: 'navigate',
  haptic: { pattern: 8 },
  sound: { kind: 'whoosh', freq: 440, durationMs: 150, gain: 0.25 },
  visual: { kind: 'slide', durationMs: 220 },
};
