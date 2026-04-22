// apps/web/lib/shippie/splash-gen.ts
/**
 * Deploy-time generator for PWA icons + iOS apple-touch-startup-image
 * splashes.
 *
 * Runs in the deploy pipeline (Node.js) after a successful build, using
 * `sharp` for image processing. Outputs are uploaded to R2 under
 * `icons/<slug>/<size>.png` and `splash/<slug>/<device>.png` — the
 * worker routes at `/__shippie/icons/*` and `/__shippie/splash/*` read
 * from those keys.
 */
import sharp from 'sharp';

export interface IconOutput {
  size: number;
  purpose: 'any' | 'maskable';
  buffer: Buffer;
}
export interface SplashOutput {
  device: string;
  width: number;
  height: number;
  buffer: Buffer;
}

export const ICON_SIZES: Array<{ size: number; purpose: 'any' | 'maskable' }> = [
  { size: 192, purpose: 'any' },
  { size: 512, purpose: 'any' },
  { size: 192, purpose: 'maskable' },
  { size: 512, purpose: 'maskable' },
];

// Common iPhone/iPad splash sizes — portrait only (Shippie wrapper is
// portrait-locked by default).
export const IOS_SPLASH_SIZES: ReadonlyArray<{ device: string; width: number; height: number }> = [
  { device: 'iphone-se-2', width: 750, height: 1334 },
  { device: 'iphone-8-plus', width: 1242, height: 2208 },
  { device: 'iphone-x-xs-11pro', width: 1125, height: 2436 },
  { device: 'iphone-xr-11', width: 828, height: 1792 },
  { device: 'iphone-xs-max-11pro-max', width: 1242, height: 2688 },
  { device: 'iphone-12-mini', width: 1080, height: 2340 },
  { device: 'iphone-12-13-14', width: 1170, height: 2532 },
  { device: 'iphone-12-13-14-pro-max', width: 1284, height: 2778 },
  { device: 'iphone-14-pro', width: 1179, height: 2556 },
  { device: 'iphone-14-pro-max-15-pro-max', width: 1290, height: 2796 },
  { device: 'ipad-9th-10th', width: 1620, height: 2160 },
  { device: 'ipad-air', width: 1640, height: 2360 },
  { device: 'ipad-pro-11', width: 1668, height: 2388 },
  { device: 'ipad-pro-129', width: 2048, height: 2732 },
];

const DEFAULT_BACKGROUND = '#14120F';
// For maskable: icon should sit inside a safe-area inset of ~20%, leaving
// room for Android's adaptive icon mask.
const MASKABLE_SAFE_INSET = 0.2;

export async function generateIcons(source: Buffer): Promise<IconOutput[]> {
  const out: IconOutput[] = [];
  for (const spec of ICON_SIZES) {
    const buffer = await (spec.purpose === 'any'
      ? sharp(source).resize(spec.size, spec.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      : renderMaskable(source, spec.size));
    out.push({ size: spec.size, purpose: spec.purpose, buffer });
  }
  return out;
}

async function renderMaskable(source: Buffer, size: number): Promise<Buffer> {
  const iconSize = Math.round(size * (1 - MASKABLE_SAFE_INSET * 2));
  const inset = Math.round((size - iconSize) / 2);
  const icon = await sharp(source).resize(iconSize, iconSize, { fit: 'contain' }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: DEFAULT_BACKGROUND },
  })
    .composite([{ input: icon, left: inset, top: inset }])
    .png()
    .toBuffer();
}

export async function generateSplashes(
  source: Buffer,
  backgroundColor: string = DEFAULT_BACKGROUND,
): Promise<SplashOutput[]> {
  const out: SplashOutput[] = [];
  for (const spec of IOS_SPLASH_SIZES) {
    const iconSize = Math.round(Math.min(spec.width, spec.height) * 0.28);
    const icon = await sharp(source).resize(iconSize, iconSize, { fit: 'contain' }).toBuffer();
    const buffer = await sharp({
      create: {
        width: spec.width,
        height: spec.height,
        channels: 4,
        background: backgroundColor,
      },
    })
      .composite([
        {
          input: icon,
          left: Math.round((spec.width - iconSize) / 2),
          top: Math.round((spec.height - iconSize) / 2),
        },
      ])
      .png()
      .toBuffer();
    out.push({ device: spec.device, width: spec.width, height: spec.height, buffer });
  }
  return out;
}
