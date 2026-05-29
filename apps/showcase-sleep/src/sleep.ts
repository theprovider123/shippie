export interface SleepDraft {
  sleptOn: string;
  bedTime: string;
  wakeTime: string;
  quality: number;
  note: string;
}

export interface SleepEntry {
  id: string;
  sleptOn: string;
  bedTime: string;
  wakeTime: string;
  durationMinutes: number;
  quality: number;
  note?: string;
  createdAt: number;
}

export interface SleepSummary {
  count: number;
  averageMinutes: number | null;
  averageQuality: number | null;
  streakDays: number;
}

export function minutesBetween(bedTime: string, wakeTime: string): number {
  const start = clockMinutes(bedTime);
  const end = clockMinutes(wakeTime);
  if (start === null || end === null) return 0;
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  return Math.max(0, adjustedEnd - start);
}

export function createSleepEntry(draft: SleepDraft, now = Date.now()): SleepEntry {
  return {
    id: `sleep_${now}`,
    sleptOn: draft.sleptOn,
    bedTime: draft.bedTime,
    wakeTime: draft.wakeTime,
    durationMinutes: minutesBetween(draft.bedTime, draft.wakeTime),
    quality: clampQuality(draft.quality),
    note: draft.note.trim() || undefined,
    createdAt: now,
  };
}

export function summarizeSleep(entries: readonly SleepEntry[], today = new Date()): SleepSummary {
  if (entries.length === 0) {
    return { count: 0, averageMinutes: null, averageQuality: null, streakDays: 0 };
  }
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const totalQuality = entries.reduce((sum, entry) => sum + entry.quality, 0);
  return {
    count: entries.length,
    averageMinutes: Math.round(totalMinutes / entries.length),
    averageQuality: totalQuality / entries.length,
    streakDays: sleepStreak(entries, today),
  };
}

export function lastSevenNights(entries: readonly SleepEntry[]): SleepEntry[] {
  return [...entries]
    .sort((a, b) => a.sleptOn.localeCompare(b.sleptOn))
    .slice(-7);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

export function defaultSleepDraft(now = new Date()): SleepDraft {
  return {
    sleptOn: localDate(now),
    bedTime: '23:00',
    wakeTime: '07:00',
    quality: 4,
    note: '',
  };
}

function sleepStreak(entries: readonly SleepEntry[], today: Date): number {
  const dates = new Set(entries.map((entry) => entry.sleptOn));
  let cursor = startOfLocalDay(today);
  let streak = 0;
  while (dates.has(localDate(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
