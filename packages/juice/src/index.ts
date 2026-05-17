/**
 * @shippie/juice — shared polish primitives for arcade games.
 *
 * Three exports:
 *   - createSoundBank   — WebAudio sample bank with mute persistence
 *   - tween             — requestAnimationFrame interpolator
 *   - Particles         — canvas-based particle system
 *
 * Plus a React subpath (./react) for `<Confetti />` and
 * `useTutorial`, and a tone-generated default sample bank at
 * ./samples that any game can import zero-bytes — sounds are
 * synthesised at first play instead of bundled as audio files,
 * keeping the package <2KB while still cohesive across games.
 *
 * Pure browser. No React import in the root entry. Mute state lives
 * in `localStorage["shippie:juice:mute"]`.
 */

export { createSoundBank, isMuted, setMuted, toggleMuted } from './sound';
export type { SoundBank, SoundOptions, SoundSpec } from './sound';

export { tween, easings } from './tween';
export type { TweenHandle, EasingFn, EasingName } from './tween';

export { Particles } from './particles';
export type { ParticleEmit, ParticleKind } from './particles';
