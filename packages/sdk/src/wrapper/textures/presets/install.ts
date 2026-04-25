import type { SensoryTexture } from '../types.ts';

/**
 * The signature moment. Install fires once per app per device — make it
 * the moment users notice Shippie feels different from a normal PWA.
 */
export const install: SensoryTexture = {
  name: 'install',
  haptic: { pattern: [15, 50, 15, 50, 30] },
  sound: { kind: 'chime', freq: 988, durationMs: 600, gain: 0.6 },
  visual: {
    kind: 'lift-float',
    durationMs: 700,
    particles: {
      count: 8,
      radiusPx: 40,
      colors: ['#E8603C', '#F4B860', '#FFE69A', '#ffffff'],
      durationMs: 700,
    },
    glow: { color: 'rgba(244,184,96,0.55)', opacityMax: 0.55, durationMs: 700 },
  },
};
