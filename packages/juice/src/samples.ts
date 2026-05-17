/**
 * Default sample preset — used by every arcade game so audio feels
 * cohesive across the slate. Each game can import this verbatim or
 * override individual entries.
 *
 * All synthesised at play time by the tone generator in `sound.ts`.
 * No bundled audio files. No CDN.
 */

import type { SoundSpec } from './sound';

export const ARCADE_SAMPLES = {
  /** UI tap — short bright click. */
  tap: { freq: 880, durationMs: 60, shape: 'sine', peak: 0.18, attackMs: 2 } satisfies SoundSpec,
  /** Pop — gem/piece pop or capture. */
  pop: { freq: 660, endFreq: 440, durationMs: 90, shape: 'triangle', peak: 0.22, attackMs: 2 } satisfies SoundSpec,
  /** Whoosh — drop / fast slide / projectile fire. */
  whoosh: { freq: 220, endFreq: 110, durationMs: 140, shape: 'sawtooth', peak: 0.16, attackMs: 8 } satisfies SoundSpec,
  /** Bing — combo / bonus. */
  bing: { freq: 988, endFreq: 1318, durationMs: 220, shape: 'sine', peak: 0.2, attackMs: 4, harmonic: { freq: 1318, peak: 0.12 } } satisfies SoundSpec,
  /** Success — round/win/level chord. */
  success: {
    freq: 523, endFreq: 1046, durationMs: 380, shape: 'sine', peak: 0.24, attackMs: 8,
    harmonic: { freq: 659, peak: 0.18 },
  } satisfies SoundSpec,
  /** Level-up — bigger chord for milestone moments. */
  levelUp: {
    freq: 587, endFreq: 1175, durationMs: 480, shape: 'triangle', peak: 0.26, attackMs: 6,
    harmonic: { freq: 880, peak: 0.2 },
  } satisfies SoundSpec,
  /** Fail — soft buzz down. */
  fail: { freq: 220, endFreq: 110, durationMs: 280, shape: 'square', peak: 0.16, attackMs: 4 } satisfies SoundSpec,
  /** Warn — short attention chord (check / low health). */
  warn: { freq: 392, endFreq: 330, durationMs: 180, shape: 'triangle', peak: 0.18, attackMs: 4 } satisfies SoundSpec,
  /** Splash — water sound for Crossing drown. */
  splash: { freq: 660, endFreq: 110, durationMs: 240, shape: 'sawtooth', peak: 0.18, attackMs: 3 } satisfies SoundSpec,
  /** Thud — collision / car hit. */
  thud: { freq: 110, endFreq: 55, durationMs: 200, shape: 'square', peak: 0.22, attackMs: 1 } satisfies SoundSpec,
} as const;

export type ArcadeSample = keyof typeof ARCADE_SAMPLES;
