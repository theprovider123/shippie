import { TOTAL_KM } from './race-data.ts';

export function parsePace(value: string): number {
  const [minutesRaw, secondsRaw] = value.split(':');
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) {
    throw new Error(`Invalid pace: ${value}`);
  }
  return minutes * 60 + seconds;
}

export function formatPace(secondsPerKm: number): string {
  const safe = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatShortDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const safe = Math.abs(Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function speedMsToPace(speedMs: number | null | undefined): number | null {
  if (!speedMs || speedMs <= 0) return null;
  return 1000 / speedMs;
}

export function paceToSpeedMs(secondsPerKm: number): number {
  return 1000 / secondsPerKm;
}

export function projectedFinishSeconds(
  coveredKm: number,
  elapsedSeconds: number,
  paceSecondsPerKm: number,
  totalKm = TOTAL_KM,
): number {
  const remainingKm = Math.max(0, totalKm - Math.max(0, coveredKm));
  return elapsedSeconds + remainingKm * paceSecondsPerKm;
}

export function estimateArrivalSeconds(
  targetKm: number,
  coveredKm: number,
  elapsedSeconds: number,
  paceSecondsPerKm: number,
): number {
  const remainingKm = Math.max(0, targetKm - Math.max(0, coveredKm));
  return elapsedSeconds + remainingKm * paceSecondsPerKm;
}

export function parseClockTime(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) throw new Error(`Invalid clock: ${value}`);
  return hours * 3600 + minutes * 60;
}

export function formatClockSeconds(totalSeconds: number): string {
  const wrapped = ((Math.round(totalSeconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function cutoffCushionSeconds(cutoffTime: string, waveStart: string, arrivalElapsedSeconds: number): number {
  const cutoff = parseClockTime(cutoffTime);
  const start = parseClockTime(waveStart);
  return cutoff - (start + arrivalElapsedSeconds);
}

export function haversineKm(a: GeolocationCoordinates, b: GeolocationCoordinates): number {
  const radiusKm = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
