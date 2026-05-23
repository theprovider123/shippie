import { normalizeDegrees } from './geo';

export interface CompassReading {
  headingDeg: number;
  at: number;
}

type WebkitOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

export async function requestCompassPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
  const eventCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<PermissionState>;
  };
  if (typeof eventCtor.requestPermission !== 'function') return 'granted';
  try {
    const result = await eventCtor.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function watchCompass(onReading: (reading: CompassReading) => void): () => void {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return () => undefined;
  const handler = (event: DeviceOrientationEvent) => {
    const webkitHeading = (event as WebkitOrientationEvent).webkitCompassHeading;
    const heading =
      typeof webkitHeading === 'number'
        ? webkitHeading
        : typeof event.alpha === 'number'
          ? 360 - event.alpha
          : null;
    if (heading === null) return;
    onReading({ headingDeg: normalizeDegrees(heading), at: Date.now() });
  };
  window.addEventListener('deviceorientation', handler, true);
  return () => window.removeEventListener('deviceorientation', handler, true);
}

export function relativeBearing(targetBearing: number, heading: number): number {
  const delta = normalizeDegrees(targetBearing - heading);
  return delta > 180 ? delta - 360 : delta;
}
