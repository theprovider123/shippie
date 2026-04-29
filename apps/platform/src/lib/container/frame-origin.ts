/**
 * Resolve postMessage origins for container iframe apps.
 *
 * Runtime URLs (`/run/<slug>/`, dev URLs, custom domains) have a concrete
 * origin, so the bridge can use a precise targetOrigin and filter replies
 * by that same origin. Srcdoc/blob package frames are sandboxed into an
 * opaque origin, so they must keep the wildcard target and unfiltered
 * receive path until the package runtime gets signed source handles.
 */

export interface FrameBridgeOrigins {
  targetOrigin: string;
  allowedOrigin?: string;
}

export function frameBridgeOrigins(
  frameSrc: string | null,
  currentHref: string,
): FrameBridgeOrigins {
  const origin = frameSrc ? resolveFrameOrigin(frameSrc, currentHref) : null;
  if (!origin || origin === 'null') return { targetOrigin: '*' };
  return { targetOrigin: origin, allowedOrigin: origin };
}

export function resolveFrameOrigin(frameSrc: string, currentHref: string): string | null {
  try {
    return new URL(frameSrc, currentHref).origin;
  } catch {
    return null;
  }
}
