import type { SensoryTexture } from '../types.ts';

export const complete: SensoryTexture = {
  name: 'complete',
  haptic: { pattern: [10, 30, 10] },
  sound: { kind: 'pop', freq: 660, durationMs: 80, gain: 0.5 },
  visual: {
    kind: 'pop',
    durationMs: 280,
    particles: {
      count: 4,
      radiusPx: 28,
      colors: ['#E8603C', '#F4B860', '#9CD3D8', '#ffffff'],
      durationMs: 400,
    },
    glow: { color: 'rgba(232,96,60,0.4)', opacityMax: 0.4, durationMs: 400 },
  },
};
