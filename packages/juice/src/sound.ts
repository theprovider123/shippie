/**
 * Tiny WebAudio sample bank with synthesised tones.
 *
 * Why synthesised vs bundled samples: keeps the package zero-byte,
 * no per-deploy sample fetches, no licence ambiguity. Each "sample"
 * is a SoundSpec describing a tiny envelope-shaped tone the bank
 * synthesises at play time. Cohesive across games because all
 * samples come from the same generator with the same envelope shape.
 *
 * Mute persistence: `localStorage["shippie:juice:mute"] === '1'`.
 *
 * AudioContext init is lazy — created on first play. Browsers gate
 * AudioContext on user gesture; we don't pre-warm to avoid
 * console warnings before first interaction.
 */

const MUTE_KEY = 'shippie:juice:mute';

export type ToneShape = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface SoundSpec {
  /** Starting frequency (Hz). */
  freq: number;
  /** Optional sweep target frequency for pitch glides. */
  endFreq?: number;
  /** Total duration (ms). */
  durationMs: number;
  /** Oscillator type. */
  shape?: ToneShape;
  /** Peak gain (0-1). Played volume = peak × user volume. */
  peak?: number;
  /** Attack time (ms). Defaults to 5ms — punchy. */
  attackMs?: number;
  /** Optional second tone played in parallel for chord depth. */
  harmonic?: { freq: number; peak?: number };
}

export interface SoundOptions {
  /** Volume multiplier 0-1 applied on top of the spec's peak. */
  volume?: number;
  /** Pitch multiplier (1 = normal, 2 = octave up). */
  pitch?: number;
}

export interface SoundBank<K extends string> {
  play(name: K, opts?: SoundOptions): void;
  /** Plays only if a non-zero gesture has happened. Browsers require it. */
  warm(): void;
}

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  // Browser-prefixed fallback for older Safari.
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  if (typeof localStorage === 'undefined') return;
  if (muted) localStorage.setItem(MUTE_KEY, '1');
  else localStorage.removeItem(MUTE_KEY);
}

export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

/**
 * Build a sound bank from a record of named specs.
 *
 *   const sfx = createSoundBank({
 *     tap:     { freq: 800, durationMs: 60, shape: 'sine', peak: 0.15 },
 *     success: { freq: 523, endFreq: 1046, durationMs: 360, peak: 0.25, harmonic: { freq: 659 } },
 *   });
 *   sfx.play('tap');
 */
export function createSoundBank<K extends string>(specs: Record<K, SoundSpec>): SoundBank<K> {
  function playOne(spec: SoundSpec, opts: SoundOptions = {}): void {
    if (isMuted()) return;
    const audio = ctx();
    if (!audio) return;
    const now = audio.currentTime;
    const dur = Math.max(0.01, spec.durationMs / 1000);
    const attack = Math.max(0.001, (spec.attackMs ?? 5) / 1000);
    const peak = (spec.peak ?? 0.2) * (opts.volume ?? 1);
    const pitch = opts.pitch ?? 1;

    const start = (freq: number, harmPeak?: number) => {
      const osc = audio.createOscillator();
      osc.type = spec.shape ?? 'sine';
      const gain = audio.createGain();
      osc.frequency.setValueAtTime(freq * pitch, now);
      if (spec.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(spec.endFreq * pitch, now + dur);
      }
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(harmPeak ?? peak, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    };

    start(spec.freq);
    if (spec.harmonic) start(spec.harmonic.freq, (spec.harmonic.peak ?? peak * 0.7));
  }

  return {
    play(name, opts) {
      const spec = specs[name];
      if (!spec) return;
      playOne(spec, opts);
    },
    warm() {
      const audio = ctx();
      if (!audio) return;
      if (audio.state === 'suspended') void audio.resume();
    },
  };
}
