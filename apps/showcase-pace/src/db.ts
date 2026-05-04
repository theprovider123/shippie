/**
 * Pace persistence — saved plans. localStorage.
 */
const STORAGE_KEY = 'shippie.pace.v1';

export type Sport = 'run' | 'walk' | 'cycle';

export interface Plan {
  id: string;
  name: string;
  sport: Sport;
  distance_km: number;
  /** Total target time in seconds. */
  target_seconds: number;
  saved_at: string;
}

interface Persisted {
  plans: Plan[];
}

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  walk: 'Walk',
  cycle: 'Cycle',
};

/** Conventional easy-pace seconds-per-km by sport — used for the default
 * dial state and the pace-zone hints on the run side. */
export const DEFAULT_PACE_SEC_PER_KM: Record<Sport, number> = {
  run: 360, // 6:00/km
  walk: 720, // 12:00/km
  cycle: 150, // 2:30/km ≈ 24 km/h
};

const SEED_PLANS: Plan[] = [
  {
    id: 'seed-1',
    name: 'Saturday long run',
    sport: 'run',
    distance_km: 12,
    target_seconds: 12 * 360,
    saved_at: '2026-04-25T07:00:00Z',
  },
  {
    id: 'seed-2',
    name: 'Evening cycle',
    sport: 'cycle',
    distance_km: 25,
    target_seconds: 25 * 150,
    saved_at: '2026-04-25T18:00:00Z',
  },
];

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plans: SEED_PLANS };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      plans: Array.isArray(parsed.plans) && parsed.plans.length > 0 ? parsed.plans : SEED_PLANS,
    };
  } catch {
    return { plans: SEED_PLANS };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Format seconds as HH:MM:SS (or MM:SS for under an hour). */
export function fmtClock(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format pace as M:SS/km (always min:sec). */
export function fmtPace(secondsPerKm: number): string {
  const sec = Math.max(0, Math.round(secondsPerKm));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Speed in km/h from seconds-per-km. */
export function paceToKph(secondsPerKm: number): number {
  if (secondsPerKm <= 0) return 0;
  return Math.round((3600 / secondsPerKm) * 10) / 10;
}

/** Parse "MM:SS" or "H:MM:SS" → total seconds. Returns null on garbage. */
export function parseClock(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) return nums[0]! * 60 + nums[1]!;
  return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
}
