/**
 * Lightweight client-side event tracking for the control plane.
 *
 * Fires a POST to /__shippie/analytics on the current origin (works
 * in both browser and installed PWA). Falls back silently if the
 * endpoint is unavailable.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({
      events: [{ event_name: event, properties: props, url: window.location.pathname }],
    });
    // Fire-and-forget via sendBeacon (survives page unload) with fetch fallback
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/__shippie/analytics', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/__shippie/analytics', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Analytics must never break the app
  }
}
