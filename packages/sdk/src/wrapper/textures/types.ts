/**
 * A sensory texture is a composite multi-output interaction pattern:
 * haptic + sound + visual all fire in lockstep within a single animation
 * frame. Textures are pre-designed; makers don't compose their own (they
 * pick by name from the preset registry).
 *
 * Sound is opt-in (config.sound = true). Haptics and visuals are on by
 * default. Each output respects prefers-reduced-motion and prefers-
 * reduced-data automatically — the engine drops outputs that conflict
 * with user preferences.
 */
export type TextureName =
  | 'confirm'
  | 'complete'
  | 'error'
  | 'navigate'
  | 'delete'
  | 'refresh'
  | 'install'
  | 'milestone'
  | 'toggle';

export interface HapticRecipe {
  /** Vibration pattern in ms; passed to navigator.vibrate. */
  pattern: number | number[];
}

export interface SoundRecipe {
  /** Synthesis kind for the procedural synth. */
  kind: 'click' | 'pop' | 'bonk' | 'whoosh' | 'chime';
  /** Base frequency in Hz. */
  freq: number;
  /** Total duration in ms. */
  durationMs: number;
  /** Amplitude 0–1. */
  gain: number;
}

export interface VisualRecipe {
  /** Animation kind applied to the originating element. */
  kind: 'scale-spring' | 'pop' | 'shake' | 'glow' | 'fade-out' | 'lift-float' | 'slide';
  /** Total duration in ms. */
  durationMs: number;
  /** Optional secondary effect (particles, glow) layered on top. */
  particles?: { count: number; radiusPx: number; colors: string[]; durationMs: number };
  glow?: { color: string; opacityMax: number; durationMs: number };
  /**
   * Optional full-viewport flash overlay. Used by the install signature moment
   * to glow the whole page sunset orange briefly. Independent of `glow` (which
   * targets the originating element).
   */
  flash?: { color: string; opacity: number; durationMs: number };
}

export interface SensoryTexture {
  name: TextureName;
  haptic?: HapticRecipe;
  sound?: SoundRecipe;
  visual?: VisualRecipe;
}

export interface TextureEngineConfig {
  /** Master switch. Default true. */
  enabled: boolean;
  /** Enable sound output. Default false (opt-in per privacy/intrusiveness). */
  sound: boolean;
  /** Enable haptic output. Default true. */
  haptics: boolean;
  /** Enable visual output. Default true. */
  visuals: boolean;
  /** Audio gain multiplier 0–1 applied to every sound output. Default 0.5. */
  volume: number;
}

export const DEFAULT_TEXTURE_CONFIG: TextureEngineConfig = {
  enabled: true,
  sound: false,
  haptics: true,
  visuals: true,
  volume: 0.5,
};
