/**
 * useSafeArea — read CSS env(safe-area-inset-*) values as numbers.
 *
 * Returns the resolved px values for the four `env(safe-area-inset-*)`
 * vars at call time. Reads via a probe element so values reflect what
 * the browser would actually paint with `padding: env(...)`. Returns
 * zeros in non-browser / non-iOS contexts (Android Chrome reports 0
 * for top/bottom unless `viewport-fit=cover` is set, which the
 * Shippie wrapper injects for every deployed app).
 *
 * Re-read inside `window.addEventListener('orientationchange', ...)`
 * if you cache values; the bottom inset changes when a phone rotates
 * landscape ↔ portrait and when the iOS home indicator hides/shows.
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function useSafeArea(): SafeAreaInsets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);';
  document.documentElement.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const insets: SafeAreaInsets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}
