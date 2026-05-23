import { normalizeDegrees } from './geo';

export type CompassSource = 'webkit' | 'tilt-corrected' | 'raw-alpha';

export interface CompassReading {
  /** Smoothed heading after the low-pass filter, degrees 0..360. */
  headingDeg: number;
  /** Raw heading from this event, degrees 0..360 — for debug / honest readout. */
  rawHeadingDeg: number;
  /** 0..1 confidence based on the wrap-aware stability of recent samples. */
  confidence: number;
  /** Where this heading came from. */
  source: CompassSource;
  /** When this reading happened (ms). */
  at: number;
}

type WebkitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

// Tunable: 0..1. Lower = more smoothing, slower to react.
const EMA_ALPHA = 0.18;
// How many recent raw samples feed the variance estimate for confidence.
const VARIANCE_WINDOW = 16;

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

  // Filter state — reset on each subscription so a new screen mount gets a fresh smoother.
  let smoothedX: number | null = null;
  let smoothedY: number | null = null;
  const recent: number[] = [];

  const handler = (event: DeviceOrientationEvent) => {
    // 1) Source — iOS gives us the tilt-corrected true heading via webkitCompassHeading.
    //    Android publishes alpha/beta/gamma; tilt-correct alpha into a real horizontal heading.
    const webkit = (event as WebkitOrientationEvent).webkitCompassHeading;
    let raw: number;
    let source: CompassSource;
    if (typeof webkit === 'number') {
      raw = webkit;
      source = 'webkit';
    } else if (typeof event.alpha === 'number') {
      const tiltCorrected = tiltCompensatedHeading(event.alpha, event.beta, event.gamma);
      if (tiltCorrected !== null) {
        raw = tiltCorrected;
        source = 'tilt-corrected';
      } else {
        // Fall back to a naive alpha → heading conversion if beta/gamma are missing.
        raw = 360 - event.alpha;
        source = 'raw-alpha';
      }
    } else {
      return;
    }
    raw = normalizeDegrees(raw);

    // 2) Low-pass filter on the unit vector (wrap-aware: averaging degrees breaks at 0/360).
    const rad = (raw * Math.PI) / 180;
    const x = Math.cos(rad);
    const y = Math.sin(rad);
    if (smoothedX === null || smoothedY === null) {
      smoothedX = x;
      smoothedY = y;
    } else {
      smoothedX = smoothedX + EMA_ALPHA * (x - smoothedX);
      smoothedY = smoothedY + EMA_ALPHA * (y - smoothedY);
    }
    const smoothed = normalizeDegrees((Math.atan2(smoothedY, smoothedX) * 180) / Math.PI);

    // 3) Confidence — circular mean resultant length R over the last N raw samples.
    //    R = 1 → samples all agree (stable); R near 0 → samples scattered (noisy).
    recent.push(raw);
    if (recent.length > VARIANCE_WINDOW) recent.shift();
    const confidence = recent.length < 4 ? 0.5 : meanResultantLength(recent);

    onReading({
      headingDeg: smoothed,
      rawHeadingDeg: raw,
      confidence,
      source,
      at: Date.now(),
    });
  };

  window.addEventListener('deviceorientation', handler, true);
  return () => window.removeEventListener('deviceorientation', handler, true);
}

/**
 * Signed angular delta from heading to target bearing, range [-180, 180].
 * Positive = target is clockwise of current heading.
 */
export function relativeBearing(targetBearing: number, heading: number): number {
  const delta = normalizeDegrees(targetBearing - heading);
  return delta > 180 ? delta - 360 : delta;
}

/**
 * Tilt-corrected horizontal heading derived from DeviceOrientation alpha/beta/gamma.
 * This is the Android-style derivation that compensates for phone pitch and roll —
 * raw alpha lies whenever the phone isn't held flat. Returns null if inputs are missing.
 *
 * Reference: MDN, "Detecting device orientation."
 */
function tiltCompensatedHeading(alpha: number | null, beta: number | null, gamma: number | null): number | null {
  if (alpha === null || beta === null || gamma === null) return null;
  const a = (alpha * Math.PI) / 180;
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);
  // World-frame projection of the device's local Y axis onto the horizontal plane.
  const Vx = -cA * sG - sA * sB * cG;
  const Vy = -sA * sG + cA * sB * cG;
  if (Math.abs(Vx) < 1e-9 && Math.abs(Vy) < 1e-9) return null;
  let heading = Math.atan2(Vx, Vy) * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return heading;
}

/**
 * Mean resultant length of circular samples: 1.0 = aligned (stable),
 * 0 = uniformly scattered (noisy). Wrap-aware via x/y projection.
 */
function meanResultantLength(samples: number[]): number {
  let mx = 0;
  let my = 0;
  for (const s of samples) {
    const r = (s * Math.PI) / 180;
    mx += Math.cos(r);
    my += Math.sin(r);
  }
  mx /= samples.length;
  my /= samples.length;
  return Math.max(0, Math.min(1, Math.sqrt(mx * mx + my * my)));
}
