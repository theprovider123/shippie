/**
 * Local persistence for sip-log. Uses localStorage for simplicity —
 * sips are tiny rows (id + kind + ml + mg + ts) and rarely exceed a
 * few hundred per month. wa-sqlite/OPFS is overkill for the volume.
 *
 * The Shippie runtime watches `localStorage` writes via the patina /
 * proof spine; each sip also broadcasts an intent to the container so
 * Sleep Logger / Daily Briefing / Mood Pulse get the live signal.
 */
const STORAGE_KEY = 'shippie.sip-log.v1';

export type SipKind = 'water' | 'coffee' | 'tea';

export interface Sip {
  id: string;
  kind: SipKind;
  /** Volume in ml (water = 250 default). */
  ml: number;
  /** Caffeine in mg (coffee = 64 default, tea = 28). */
  mg: number;
  logged_at: string;
}

interface Persisted {
  sips: Sip[];
}

export const PRESETS: Record<SipKind, { ml: number; mg: number; emoji: string; label: string }> = {
  water: { ml: 250, mg: 0, emoji: '💧', label: 'Water' },
  coffee: { ml: 240, mg: 64, emoji: '☕', label: 'Coffee' },
  tea: { ml: 240, mg: 28, emoji: '🍵', label: 'Tea' },
};

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sips: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      sips: Array.isArray(parsed.sips) ? parsed.sips : [],
    };
  } catch {
    return { sips: [] };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop sips older than 30 days so localStorage stays bounded. */
export function pruneOld(sips: Sip[]): Sip[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return sips.filter((s) => new Date(s.logged_at).getTime() >= cutoff);
}

/** YYYY-MM-DD bucket helpers for the daily totals + chart. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
