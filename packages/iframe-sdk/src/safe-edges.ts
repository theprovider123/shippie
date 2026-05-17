/**
 * Safe-edges — small wrapper over the iframe-sdk's `safeEdges`
 * namespace. Games import this directly so they don't have to learn
 * the raw SDK surface or carry an `appId` around just to declare a
 * region.
 *
 * Usage:
 *
 *   import { declareInputRegion, onHostInsets } from '@shippie/iframe-sdk/safe-edges';
 *
 *   declareInputRegion('bottom', { appId: 'app_stack' });
 *   onHostInsets((insets) => { ... }, { appId: 'app_stack' });
 *
 * If the game already has a sdk instance, prefer the
 * `sdk.safeEdges.*` methods directly — this module is for one-shot
 * declarations where the caller doesn't want to retain the sdk.
 */

import { createShippieIframeSdk, type HostInsets, type InputRegionOwns } from './index';

export type { HostInsets, InputRegionOwns };

interface SafeEdgesOpts {
  /** Stable app id matching the container's curated entry. */
  appId: string;
}

/**
 * Declare which part of the viewport this app's touch input occupies.
 * No-op outside the container. Safe to call repeatedly.
 */
export function declareInputRegion(owns: InputRegionOwns, opts: SafeEdgesOpts): void {
  const sdk = createShippieIframeSdk(opts);
  sdk.safeEdges.declareInputRegion(owns);
}

/**
 * Subscribe to host-side gesture-geometry updates. Returns an
 * unsubscribe function. No-op outside the container.
 */
export function onHostInsets(
  handler: (insets: HostInsets) => void,
  opts: SafeEdgesOpts,
): () => void {
  const sdk = createShippieIframeSdk(opts);
  return sdk.safeEdges.onHostInsets(handler);
}
