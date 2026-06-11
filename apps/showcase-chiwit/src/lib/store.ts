// Garden data layer — v1 model (replaces old daily-pulse model)

export type MoodWord = 'heavy' | 'low' | 'okay' | 'light' | 'bright';
export type ThingKind = 'medication' | 'water' | 'movement' | 'sleep' | string;

export interface DayLog {
  date: string;                      // YYYY-MM-DD local
  mood?: MoodWord;
  things: Record<string, ThingEntry>;
  journal: JournalEntry[];
  intention?: string;
}

export interface ThingEntry {
  kind: ThingKind;
  action: 'done' | 'skipped';
  count?: number;
  detail?: string;
  at: number;
}

export interface JournalEntry {
  id: string;
  text: string;
  at: number;
}

export interface AmbientEvent {
  kind: string;
  sourceApp: string;
  at: number;
  payload?: Record<string, unknown>;
}

export interface Letter {
  id: string;
  weekEnding: string;
  body: string;
  pills: string[];
  arc: (MoodWord | null)[];
}

export interface ChiwitState {
  version: 1;
  days: Record<string, DayLog>;
  adoptedWords: string[];
  letters: Letter[];
  dismissedObservations: string[];
  ambient: AmbientEvent[];
  exports: { kind: 'therapy-export'; at: number }[];
}

export const STORAGE_KEY = 'shippie.chiwit.garden.v1';
export const OLD_KEY = 'shippie.chiwit.daily-pulse.v1';

export function emptyState(): ChiwitState {
  return {
    version: 1,
    days: {},
    adoptedWords: [],
    letters: [],
    dismissedObservations: [],
    ambient: [],
    exports: [],
  };
}

export function localDate(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function todayLocal(): string {
  return localDate();
}

export function loadState(): ChiwitState {
  if (typeof localStorage === 'undefined') return emptyState();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ChiwitState;
      // Version guard
      if (parsed.version !== 1) return emptyState();
      return parsed;
    } catch {
      return emptyState();
    }
  }

  // First load — STORAGE_KEY not found. Check for old pulse data.
  // one-time lossless import: old hydration entries → water count; numeric moods discarded — cannot become words honestly
  const state = emptyState();
  const oldRaw = localStorage.getItem(OLD_KEY);
  if (oldRaw) {
    try {
      const oldData = JSON.parse(oldRaw) as {
        entries?: Array<{
          kind: string;
          date?: string;
          value?: number;
          amount?: number;
          createdAt?: number;
        }>;
        checkins?: unknown[];
      };

      if (Array.isArray(oldData.entries)) {
        const waterEntries = oldData.entries.filter(
          (e) => e.kind === 'hydration' || e.kind === 'water',
        );

        const byDate: Record<string, number> = {};
        for (const entry of waterEntries) {
          const date = entry.date ?? todayLocal();
          byDate[date] = (byDate[date] ?? 0) + (entry.value ?? 1);
        }

        for (const [date, count] of Object.entries(byDate)) {
          if (!state.days[date]) {
            state.days[date] = { date, things: {}, journal: [] };
          }
          state.days[date].things['water'] = {
            kind: 'water',
            action: 'done',
            count,
            at: Date.now(),
          };
        }
      }
    } catch {
      // Old data malformed — start fresh, no import
    }
  }

  // Persist the freshly-migrated state so next load uses STORAGE_KEY
  saveState(state);
  return state;
}

export function saveState(state: ChiwitState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(state: ChiwitState, ms = 300): void {
  if (_saveTimer !== null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveState(state);
    _saveTimer = null;
  }, ms);
}
