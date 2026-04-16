/**
 * Best-effort haptic feedback. Wraps navigator.vibrate().
 * Silent no-op if unsupported (iOS, desktop).
 */
export function haptic(style: 'light' | 'medium' = 'light'): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(style === 'light' ? 10 : 25);
    }
  } catch { /* never break the app */ }
}
