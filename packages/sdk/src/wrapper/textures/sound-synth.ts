/**
 * Web Audio oscillator-based synth. Each kind picks an oscillator
 * waveform that gives the right percussive character; the gain envelope
 * does the work of making it feel like a tap, not a synth tone.
 *
 * Procedural-only. Real sampled audio is a follow-up — when we swap, the
 * call sites don't move because the recipe types stay the same.
 */
import type { SoundRecipe } from './types.ts';

export interface SynthDeps {
  audioCtx: AudioContext | null;
  /** Master volume 0–1 from texture engine config. */
  masterVolume: number;
}

let sharedCtx: AudioContext | null = null;

/** Lazy-construct a shared AudioContext on first call. */
export function getAudioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    return null;
  }
}

const OSC_TYPES: Record<SoundRecipe['kind'], OscillatorType> = {
  click: 'square',
  pop: 'sine',
  bonk: 'triangle',
  whoosh: 'sawtooth',
  chime: 'sine',
};

export function synthesise(recipe: SoundRecipe, deps: SynthDeps): void {
  const ctx = deps.audioCtx;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = OSC_TYPES[recipe.kind];
    osc.frequency.value = recipe.freq;

    const finalGain = recipe.gain * deps.masterVolume;
    const t = ctx.currentTime;
    const dur = recipe.durationMs / 1000;
    gain.gain.setValueAtTime(finalGain, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur);
  } catch {
    // Audio failure must never break interaction. Swallow.
  }
}

export function _resetAudioCtxForTest(): void {
  sharedCtx = null;
}
