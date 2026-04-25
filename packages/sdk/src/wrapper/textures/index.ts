import { registerTexture } from './engine.ts';
import { confirm } from './presets/confirm.ts';
import { complete } from './presets/complete.ts';
import { error } from './presets/error.ts';
import { navigate } from './presets/navigate.ts';
import { delete as deleteTex } from './presets/delete.ts';
import { refresh } from './presets/refresh.ts';
import { install } from './presets/install.ts';
import { milestone } from './presets/milestone.ts';
import { toggle } from './presets/toggle.ts';

let registered = false;
export function registerBuiltinTextures(): void {
  if (registered) return;
  for (const t of [confirm, complete, error, navigate, deleteTex, refresh, install, milestone, toggle]) {
    registerTexture(t);
  }
  registered = true;
}

/** Test seam — re-arm the latch so tests can re-register after a reset. */
export function _resetBuiltinRegistrationForTest(): void {
  registered = false;
}

export {
  fireTexture,
  configureTextureEngine,
  getTextureEngineConfig,
  registerTexture,
} from './engine.ts';
export type {
  SensoryTexture,
  TextureName,
  TextureEngineConfig,
  HapticRecipe,
  SoundRecipe,
  VisualRecipe,
} from './types.ts';
