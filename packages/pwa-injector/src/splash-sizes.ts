/**
 * iOS apple-touch-startup-image device sizes.
 *
 * KEEP IN SYNC with `apps/web/lib/shippie/splash-gen.ts::IOS_SPLASH_SIZES`.
 * The deploy-time generator writes one PNG per entry to R2 at
 * `splash/<slug>/<device>.png`. This file is the injector's view of
 * the same list so it can emit matching `<link rel="apple-touch-startup-image">`
 * tags without cross-package imports from apps/web into packages/.
 *
 * If either list changes, update the other.
 */
export interface IosSplashSize {
  device: string;
  width: number;
  height: number;
}

export const IOS_SPLASH_SIZES: ReadonlyArray<IosSplashSize> = [
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

/**
 * Media query for `<link rel="apple-touch-startup-image">`.
 * iOS is forgiving about the pixel-ratio hint; we default to 3
 * (Retina) across the board since nearly all supported devices
 * are 3x displays.
 */
export function splashMediaQuery(size: IosSplashSize): string {
  // device-width/device-height are in CSS pixels, not device pixels.
  const cssWidth = Math.round(size.width / 3);
  const cssHeight = Math.round(size.height / 3);
  return [
    `(device-width: ${cssWidth}px)`,
    `(device-height: ${cssHeight}px)`,
    `(-webkit-device-pixel-ratio: 3)`,
    `(orientation: portrait)`,
  ].join(' and ');
}
