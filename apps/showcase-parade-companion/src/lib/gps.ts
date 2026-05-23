export interface GpsFix {
  lng: number;
  lat: number;
  accuracyM: number;
  at: number;
  source: 'gps';
}

export interface GpsWatchOptions {
  batterySaver?: boolean;
  onFix: (fix: GpsFix) => void;
  onError: (message: string) => void;
}

export const LIVE_GPS_MAX_AGE_MS = 120_000;
export const REPORT_GPS_MAX_ACCURACY_M = 350;

export function warmUp(): Promise<GpsFix | null> {
  if (!hasGeolocation()) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toFix(position)),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  });
}

export function watchGps(options: GpsWatchOptions): () => void {
  if (!hasGeolocation()) {
    options.onError('Location is not available in this browser.');
    return () => undefined;
  }

  if (options.batterySaver) {
    let stopped = false;
    let timer: number | undefined;
    const poll = () => {
      if (stopped) return;
      navigator.geolocation.getCurrentPosition(
        (position) => options.onFix(toFix(position)),
        (error) => options.onError(error.message || 'Could not get your location.'),
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 30_000 },
      );
      timer = window.setTimeout(poll, 45_000);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }

  const id = navigator.geolocation.watchPosition(
    (position) => options.onFix(toFix(position)),
    (error) => options.onError(error.message || 'Could not get your location.'),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/**
 * Course over ground (degrees, 0..360) — the bearing between two successive fixes,
 * but only when the implied speed exceeds `minSpeedMps`. Returns null otherwise.
 * Useful as a magnetometer-independent heading source: when the user is actually
 * walking, where they're walking IS where they're facing.
 */
export function courseOverGround(
  prev: Pick<GpsFix, 'lng' | 'lat' | 'at'> | null,
  next: Pick<GpsFix, 'lng' | 'lat' | 'at'> | null,
  minSpeedMps = 0.5,
): number | null {
  if (!prev || !next) return null;
  const dtSeconds = (next.at - prev.at) / 1000;
  if (!(dtSeconds > 0)) return null;
  // Lazy-import-style: keep gps.ts free of geo dependency by inlining the maths.
  // Bearing from prev → next (forward azimuth).
  const φ1 = (prev.lat * Math.PI) / 180;
  const φ2 = (next.lat * Math.PI) / 180;
  const Δλ = ((next.lng - prev.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  // Haversine distance for the speed check.
  const Δφ = φ2 - φ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distance = 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const speed = distance / dtSeconds;
  if (speed < minSpeedMps) return null;
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
}

export function formatAccuracy(fix: Pick<GpsFix, 'accuracyM'> | null): string {
  if (!fix) return 'No fix';
  if (fix.accuracyM < 1000) return `±${Math.round(fix.accuracyM)} m`;
  return `±${(fix.accuracyM / 1000).toFixed(1)} km`;
}

export function isFreshGpsFix(fix: Pick<GpsFix, 'at'> | null, now = Date.now()): boolean {
  if (!fix) return false;
  const age = now - fix.at;
  return Number.isFinite(age) && age >= 0 && age <= LIVE_GPS_MAX_AGE_MS;
}

export function isReportableGpsFix(fix: Pick<GpsFix, 'accuracyM' | 'at'> | null, now = Date.now()): boolean {
  return isFreshGpsFix(fix, now) && Number(fix?.accuracyM) <= REPORT_GPS_MAX_ACCURACY_M;
}

export function formatGpsAge(fix: Pick<GpsFix, 'at'> | null, now = Date.now()): string {
  if (!fix) return 'No live snapshot';
  const seconds = Math.max(0, Math.round((now - fix.at) / 1000));
  if (!Number.isFinite(seconds)) return 'No live snapshot';
  if (seconds < 5) return 'live now';
  if (seconds < 90) return `${seconds}s old`;
  return `${Math.round(seconds / 60)} min old`;
}

function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

function toFix(position: GeolocationPosition): GpsFix {
  return {
    lng: position.coords.longitude,
    lat: position.coords.latitude,
    accuracyM: position.coords.accuracy,
    at: position.timestamp,
    source: 'gps',
  };
}
