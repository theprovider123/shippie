/**
 * Deploy-time asset generation — wires splash-gen into the deploy
 * pipeline. Uploads to the public R2 bucket under:
 *   icons/<slug>/<size>.png            (plain alias for "any" purpose)
 *   icons/<slug>/<size>-any.png
 *   icons/<slug>/<size>-maskable.png
 *   splash/<slug>/<device>.png
 *
 * The worker at `services/worker/src/router/icons.ts` reads
 * `icons/<slug>/<size>.png` from SHIPPIE_PUBLIC, and the splash router
 * reads `splash/<slug>/<device>.png`. Keeping a plain `<size>.png`
 * alias means we stay compatible with the existing icons route while
 * adding the `<size>-<purpose>.png` variants for the manifest.
 */
import type { R2Store } from '@shippie/dev-storage';
import { generateIcons, generateSplashes } from './splash-gen.ts';

export interface GenerateAssetsInput {
  slug: string;
  iconBuffer: Buffer;
  /** e.g. '#14120F' — used as the splash background. */
  backgroundColor?: string;
  /** Public R2 bucket (SHIPPIE_PUBLIC in prod, shippie-public dev dir in dev). */
  r2Public: R2Store;
}

export interface GenerateAssetsResult {
  iconKeys: string[];
  splashKeys: string[];
  errors: string[];
}

export async function generateAssets(input: GenerateAssetsInput): Promise<GenerateAssetsResult> {
  const iconKeys: string[] = [];
  const splashKeys: string[] = [];
  const errors: string[] = [];

  try {
    const icons = await generateIcons(input.iconBuffer);
    for (const icon of icons) {
      const variantKey = `icons/${input.slug}/${icon.size}-${icon.purpose}.png`;
      await input.r2Public.put(variantKey, new Uint8Array(icon.buffer));
      iconKeys.push(variantKey);
      // Back-compat alias for the existing icons route, which reads
      // `icons/<slug>/<size>.png` without a purpose suffix.
      if (icon.purpose === 'any') {
        const aliasKey = `icons/${input.slug}/${icon.size}.png`;
        await input.r2Public.put(aliasKey, new Uint8Array(icon.buffer));
        iconKeys.push(aliasKey);
      }
    }
  } catch (err) {
    errors.push(`icons: ${(err as Error).message}`);
  }

  try {
    const splashes = await generateSplashes(input.iconBuffer, input.backgroundColor);
    for (const splash of splashes) {
      const key = `splash/${input.slug}/${splash.device}.png`;
      await input.r2Public.put(key, new Uint8Array(splash.buffer));
      splashKeys.push(key);
    }
  } catch (err) {
    errors.push(`splash: ${(err as Error).message}`);
  }

  return { iconKeys, splashKeys, errors };
}
