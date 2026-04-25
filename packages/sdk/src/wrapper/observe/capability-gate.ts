// packages/sdk/src/wrapper/observe/capability-gate.ts
/**
 * Capability detection. Rules declare what they need; the gate filters
 * out rules whose capabilities are missing. iOS Safari users silently
 * get no-ops for Android-only enhancements — no banner, no badge, just
 * absent affordances. That's the positioning rule.
 */
import type { Capability } from './types.ts';

export function hasCapability(cap: Capability): boolean {
  if (typeof window === 'undefined') return false;
  switch (cap) {
    case 'wakelock':
      return 'wakeLock' in (navigator as unknown as { wakeLock?: unknown });
    case 'share-target':
      // Share Target requires PWA install; we approximate with
      // `serviceWorker` + `display-mode: standalone`. The Worker-served
      // manifest declares the share_target intent; OS-level registration
      // happens at install time. We can't detect "installed" reliably
      // pre-install, so we assume share-target is supported wherever
      // service workers are.
      return 'serviceWorker' in navigator;
    case 'haptics':
      return typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === 'function';
    case 'barcode':
      return 'BarcodeDetector' in (window as unknown as { BarcodeDetector?: unknown });
    case 'broadcast-channel':
      return typeof (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
    default:
      return false;
  }
}

export function ruleCanRun(capabilities: readonly Capability[]): boolean {
  return capabilities.every(hasCapability);
}
