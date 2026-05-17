/**
 * med-schedule.ts — given a free-text schedule string, produce next-due
 * times. Honest about parser limits.
 *
 * We parse a small set of common shapes a doctor or pharmacy might
 * write on a label. If the text doesn't match any known shape, return
 * `{ kind: 'unparseable' }` and let the caller fall back to "show the
 * raw schedule_text and let the caregiver decide".
 *
 * Supported shapes:
 *   - "Nx daily" / "N times a day" / "N times per day"        → N evenly spaced doses
 *   - "every N hours"                                          → next-due = last+N hours
 *   - "morning"|"evening"|"night"|"morning + evening"|"three times a day"
 *                                                              → fixed slot times
 *   - "as needed" / "PRN"                                      → no scheduled times
 *   - "once daily" / "daily"                                   → 1x per day
 */

export type Schedule =
  | { kind: 'unparseable'; raw: string }
  | { kind: 'as-needed'; raw: string }
  | { kind: 'fixed-slots'; raw: string; slots: readonly string[] /* 'HH:MM' */ }
  | { kind: 'every-hours'; raw: string; hours: number }
  | { kind: 'times-per-day'; raw: string; n: number };

const NAMED_SLOTS: Record<string, readonly string[]> = {
  morning: ['08:00'],
  evening: ['19:00'],
  night: ['22:00'],
  bedtime: ['22:00'],
  noon: ['12:00'],
  'morning + evening': ['08:00', '19:00'],
  'morning and evening': ['08:00', '19:00'],
  'morning, noon, evening': ['08:00', '12:00', '19:00'],
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
};

export function parseSchedule(raw: string): Schedule {
  const text = raw.trim().toLowerCase();
  if (!text) return { kind: 'unparseable', raw };

  // PRN / as-needed
  if (/\b(as needed|prn|when needed|if needed)\b/.test(text)) {
    return { kind: 'as-needed', raw };
  }

  // Named slot phrases — check the longer ones first.
  for (const phrase of Object.keys(NAMED_SLOTS).sort((a, b) => b.length - a.length)) {
    if (text.includes(phrase)) {
      return { kind: 'fixed-slots', raw, slots: NAMED_SLOTS[phrase] ?? [] };
    }
  }

  // "every N hours" / "every N hrs" / "every 6h"
  const everyHrs = /\bevery\s+(\d+)\s*(?:hours?|hrs?|h)\b/.exec(text);
  if (everyHrs && everyHrs[1]) {
    const hours = Number.parseInt(everyHrs[1], 10);
    if (Number.isFinite(hours) && hours > 0 && hours <= 24) {
      return { kind: 'every-hours', raw, hours };
    }
  }

  // "Nx daily" / "Nx a day" / "N times daily" / "N times a day" / "three times a day"
  const numericTimes = /\b(\d+)\s*(?:x|times?)\s+(?:a|per)?\s*(?:day|daily)\b/.exec(text);
  if (numericTimes && numericTimes[1]) {
    const n = Number.parseInt(numericTimes[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 12) {
      return { kind: 'times-per-day', raw, n };
    }
  }
  const wordTimes = /\b(one|two|three|four|five|six)\s+times?\s+(?:a|per)?\s*(?:day|daily)\b/.exec(text);
  if (wordTimes && wordTimes[1]) {
    const n = WORD_NUMBERS[wordTimes[1]];
    if (typeof n === 'number') return { kind: 'times-per-day', raw, n };
  }

  // bare "daily" / "once daily" / "once a day"
  if (/\b(once daily|once a day|daily)\b/.test(text)) {
    return { kind: 'times-per-day', raw, n: 1 };
  }

  return { kind: 'unparseable', raw };
}

/**
 * Given a schedule and the timestamp of the last given dose (or null),
 * compute the next-due timestamp. Returns null when the schedule is
 * either unparseable, as-needed, or doesn't have a single canonical
 * "next" slot.
 *
 * For 'fixed-slots' we map the slot times onto the given `now` calendar
 * day and pick the next one that is in the future. If all are past,
 * we use the first slot of tomorrow.
 *
 * For 'times-per-day' we evenly space N slots between 08:00 and 22:00
 * (so 1x → 08:00, 2x → 08:00 + 22:00, 3x → 08:00 + 15:00 + 22:00, etc.).
 */
export function nextDueAfter(
  schedule: Schedule,
  lastGivenAt: number | null,
  now: Date = new Date(),
): number | null {
  if (schedule.kind === 'unparseable' || schedule.kind === 'as-needed') return null;

  if (schedule.kind === 'every-hours') {
    if (lastGivenAt) return lastGivenAt + schedule.hours * 3_600_000;
    // No prior dose — schedule the first one for "now-ish" (right away).
    return now.getTime();
  }

  const slots = schedule.kind === 'fixed-slots'
    ? schedule.slots
    : evenSlots(schedule.n);

  return nextSlotAfter(slots, now);
}

function evenSlots(n: number): readonly string[] {
  if (n <= 0) return [];
  if (n === 1) return ['08:00'];
  // Distribute n times between 08:00 and 22:00 inclusive.
  const startMin = 8 * 60;
  const endMin = 22 * 60;
  const step = (endMin - startMin) / (n - 1);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = Math.round(startMin + step * i);
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

function nextSlotAfter(slots: readonly string[], now: Date): number | null {
  if (slots.length === 0) return null;
  const baseToday = new Date(now);
  for (const slot of slots) {
    const [hStr, mStr] = slot.split(':');
    const h = Number.parseInt(hStr ?? '0', 10);
    const m = Number.parseInt(mStr ?? '0', 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const candidate = new Date(baseToday);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() > now.getTime()) return candidate.getTime();
  }
  // All today's slots are past — first slot of tomorrow.
  const first = slots[0];
  if (!first) return null;
  const [hStr, mStr] = first.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  const tomorrow = new Date(baseToday);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(h, m, 0, 0);
  return tomorrow.getTime();
}

/** True if the next-due time is in the past (overdue). */
export function isOverdue(nextDueAt: number | null, now: number = Date.now()): boolean {
  if (nextDueAt === null) return false;
  return nextDueAt < now;
}
