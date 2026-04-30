/**
 * iOS / Android PWA standalone detection.
 *
 * Copy of the 3-line pattern from packages/sdk/src/wrapper/detect.ts:102
 * and packages/sdk/src/install.ts:40. We don't import @shippie/sdk here
 * because the platform sits above the SDK in the workspace graph for
 * runtime concerns; the SDK ships to consumer apps, not back to us.
 *
 * "Standalone" = the PWA is launched from the home screen / app drawer
 * rather than as a tab in Safari/Chrome. Web Push on iOS only works in
 * standalone mode (post-iOS 16.4); on Android-Chrome it works either
 * way but the prompt UX is much better in standalone.
 */
export function matchesStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navStandalone = (window.navigator as { standalone?: boolean }).standalone;
  if (navStandalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

/**
 * Web Push has a reasonable shot of working here:
 *   - iOS only inside standalone (post 16.4)
 *   - Android-Chrome anywhere, but prompt UX is best in standalone
 *   - Desktop browsers — generally yes, but we don't push there yet.
 */
export function canSurfacePushPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (isIos() && !matchesStandalone()) return false;
  return true;
}
