const DAY_MS = 24 * 60 * 60 * 1000;
const START_PROMPT_WINDOW_MS = 30 * 60 * 1000;
const TIMING_COLLAPSE_AFTER_MS = 30 * 60 * 1000;

export function isParadeDay(startTime: string, now = Date.now()): boolean {
  const range = eventDayRange(startTime);
  return Boolean(range && now >= range.start && now < range.end);
}

export function isParadeEve(startTime: string, now = Date.now()): boolean {
  const range = eventDayRange(startTime);
  return Boolean(range && now >= range.start - DAY_MS && now < range.start);
}

export function isStartPromptWindow(startTime: string, now = Date.now()): boolean {
  const start = Date.parse(startTime);
  if (!Number.isFinite(start)) return false;
  return now >= start - START_PROMPT_WINDOW_MS && now <= start;
}

export function startPromptKey(startTime: string): string {
  return `parade-companion:start-prompt:${startTime}`;
}

export interface BusTimingPresentation {
  currentIndex: number | null;
  collapsed: boolean;
}

export function busTimingPresentation(
  startTime: string,
  rowCount: number,
  now = Date.now(),
): BusTimingPresentation {
  const start = Date.parse(startTime);
  if (!Number.isFinite(start) || rowCount <= 0) {
    return { currentIndex: null, collapsed: false };
  }
  const elapsed = now - start;
  const collapsed = elapsed >= TIMING_COLLAPSE_AFTER_MS;
  if (elapsed < -START_PROMPT_WINDOW_MS) {
    return { currentIndex: null, collapsed };
  }
  if (elapsed < TIMING_COLLAPSE_AFTER_MS) {
    return { currentIndex: 0, collapsed };
  }
  if (elapsed < 90 * 60 * 1000) {
    return { currentIndex: Math.min(1, rowCount - 1), collapsed };
  }
  return { currentIndex: rowCount - 1, collapsed };
}

function eventDayRange(startTime: string): { start: number; end: number } | null {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  return { start: dayStart.getTime(), end: dayStart.getTime() + DAY_MS };
}
