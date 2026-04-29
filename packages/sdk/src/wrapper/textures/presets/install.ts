import type { SensoryTexture } from '../types.ts';

/**
 * The signature moment. Install fires once per app per device — the
 * 800ms scale-bounce-glow that makes every Shippie install feel the same:
 * a haptic pulse, a soft chime, a sunset wash across the page, and a
 * burst of brand-coloured particles.
 *
 * Brief: "App icon scales up from the install button, floats to the
 * top-left corner, settles with a spring bounce. Subtle haptic pulse.
 * Background briefly glows sunset orange (200ms, 10% opacity)."
 */
export const install: SensoryTexture = {
  name: 'install',
  haptic: { pattern: [15, 50, 15, 50, 30] },
  sound: { kind: 'chime', freq: 988, durationMs: 600, gain: 0.6 },
  visual: {
    kind: 'lift-float',
    durationMs: 800,
    particles: {
      count: 10,
      radiusPx: 56,
      colors: ['#E8603C', '#F47552', '#A8C491', '#EDE4D3'],
      durationMs: 800,
    },
    glow: { color: 'rgba(232,96,60,0.45)', opacityMax: 0.45, durationMs: 800 },
    flash: { color: '#E8603C', opacity: 0.1, durationMs: 200 },
  },
};
