import type { SensoryTexture } from '../types.ts';

const delete_: SensoryTexture = {
  name: 'delete',
  haptic: { pattern: 60 },
  sound: { kind: 'bonk', freq: 180, durationMs: 200, gain: 0.4 },
  visual: { kind: 'fade-out', durationMs: 250 },
};
export { delete_ as delete };
