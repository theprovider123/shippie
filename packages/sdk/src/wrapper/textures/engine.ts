/**
 * Texture engine — the synchronised executor for haptic + sound + visual.
 *
 * Synchronisation matters: if the haptic fires 30ms before the visual, the
 * tap feels disconnected. We schedule all three in a single rAF callback
 * so they begin within the same display frame (16.6ms at 60Hz). Modern
 * browsers don't guarantee perfect haptic alignment, but rAF gets us
 * within one vsync — close enough that users perceive the effects as one.
 */
import { synthesise, getAudioContext } from './sound-synth.ts';
import { applyVisual } from './visual-fx.ts';
import {
  DEFAULT_TEXTURE_CONFIG,
  type SensoryTexture,
  type TextureName,
  type TextureEngineConfig,
  type SoundRecipe,
} from './types.ts';

let config: TextureEngineConfig = { ...DEFAULT_TEXTURE_CONFIG };
const registry = new Map<TextureName, SensoryTexture>();

export function registerTexture(tex: SensoryTexture): void {
  registry.set(tex.name, tex);
}

export function configureTextureEngine(patch: Partial<TextureEngineConfig>): void {
  config = { ...config, ...patch };
}

export function getTextureEngineConfig(): TextureEngineConfig {
  return { ...config };
}

interface FireOptions {
  /** Test seam — replace the synth call. */
  synthOverride?: (recipe: SoundRecipe) => void;
}

export function fireTexture(
  name: TextureName,
  target: Element | null = null,
  opts: FireOptions = {},
): void {
  const tex = registry.get(name);
  if (!tex) throw new Error(`no texture registered: ${name}`);
  if (!config.enabled) return;

  const runHaptic = config.haptics && tex.haptic
    ? () => {
        if (typeof navigator === 'undefined') return;
        const v = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
        if (typeof v !== 'function') return;
        try {
          v.call(navigator, tex.haptic!.pattern);
        } catch {
          /* ignore — haptics are non-essential */
        }
      }
    : null;

  const runSound = config.sound && tex.sound
    ? () => {
        if (opts.synthOverride) {
          opts.synthOverride(tex.sound!);
          return;
        }
        synthesise(tex.sound!, { audioCtx: getAudioContext(), masterVolume: config.volume });
      }
    : null;

  const runVisual = config.visuals && tex.visual
    ? () => applyVisual(target, tex.visual!)
    : null;

  const schedule = (fn: () => void) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else fn();
  };
  schedule(() => {
    runHaptic?.();
    runSound?.();
    runVisual?.();
  });
}

export function _resetTextureEngineForTest(): void {
  config = { ...DEFAULT_TEXTURE_CONFIG };
  registry.clear();
}
