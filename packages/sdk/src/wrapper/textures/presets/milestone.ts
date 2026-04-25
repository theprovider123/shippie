import type { SensoryTexture } from '../types.ts';

export const milestone: SensoryTexture = {
  name: 'milestone',
  haptic: { pattern: [10, 40, 10, 40, 10] },
  sound: { kind: 'chime', freq: 1320, durationMs: 500, gain: 0.55 },
  visual: {
    kind: 'pop',
    durationMs: 600,
    particles: {
      count: 8,
      radiusPx: 36,
      colors: ['#E8603C', '#F4B860', '#9CD3D8', '#ffffff'],
      durationMs: 600,
    },
    glow: { color: 'rgba(232,96,60,0.5)', opacityMax: 0.5, durationMs: 600 },
  },
};
