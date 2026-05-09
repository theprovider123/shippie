/**
 * matchesStandalone — true when the page is running as an installed PWA
 * (iOS home-screen, Android home-screen, desktop window) rather than as
 * a regular browser tab. Mirrors the platform's util.
 *
 * Useful inside Shippie tools to adapt UI: hide "Install Shippie" calls
 * to action when already standalone; show "Open in app" affordances
 * differently per context.
 */
export function matchesStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navStandalone = (window.navigator as { standalone?: boolean }).standalone;
  if (navStandalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}
