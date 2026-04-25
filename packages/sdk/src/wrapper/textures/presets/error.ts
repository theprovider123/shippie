import type { SensoryTexture } from '../types.ts';

export const error: SensoryTexture = {
  name: 'error',
  haptic: { pattern: [40, 30, 40] },
  sound: { kind: 'bonk', freq: 220, durationMs: 120, gain: 0.5 },
  visual: { kind: 'shake', durationMs: 220 },
};
