/**
 * localStorage-backed mood log. One entry per day — re-tapping
 * replaces the day's score (the user's latest read is what matters).
 */
const STORAGE_KEY = 'shippie.mood-pulse.v1';

export interface MoodEntry {
  id: string;
  score: 1 | 2 | 3 | 4 | 5;
  note: string | null;
  logged_at: string; // ISO ts
}

export const MOOD_PALETTE: Array<{ score: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }> = [
  { score: 1, emoji: '🌧', label: 'rough' },
  { score: 2, emoji: '😞', label: 'low' },
  { score: 3, emoji: '😐', label: 'neutral' },
  { score: 4, emoji: '😊', label: 'good' },
  { score: 5, emoji: '☀', label: 'great' },
];

interface Persisted {
  moods: MoodEntry[];
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { moods: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
    };
  } catch {
    return { moods: [] };
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
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Drop entries older than 90 days. */
export function pruneOld(moods: MoodEntry[]): MoodEntry[] {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return moods.filter((m) => new Date(m.logged_at).getTime() >= cutoff);
}

/**
 * Set today's mood — replaces any earlier entry for today.
 * Returns the new entry list.
 */
export function setTodayMood(
  moods: MoodEntry[],
  score: MoodEntry['score'],
  note: string | null,
): { next: MoodEntry[]; entry: MoodEntry } {
  const today = todayKey();
  const others = moods.filter((m) => dayKey(m.logged_at) !== today);
  const entry: MoodEntry = {
    id: newId(),
    score,
    note: note?.trim() || null,
    logged_at: new Date().toISOString(),
  };
  return { next: pruneOld([entry, ...others]), entry };
}
