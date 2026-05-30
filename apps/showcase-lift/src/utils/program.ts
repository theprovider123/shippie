/**
 * Program logic — blocks, weeks, and where you are in them.
 *
 * A program is a block of `weeks`, each week running the same rotation of
 * session templates (Day A / B / C). Weeks carry a load multiplier so a
 * block can periodise and drop into a deload. Progress is a single
 * monotonic counter of completed sessions: this makes **missed-session
 * recovery** free — a skipped calendar day never advances the pointer, so
 * you always resume exactly where you left off rather than losing a slot.
 *
 * Pure and deterministic; the DB/UI layers feed it counts and rows.
 */

export interface ProgramPosition {
  /** 0-based week within the block. */
  weekIndex: number;
  /** 0-based session within the week's rotation. */
  dayIndex: number;
  /** Overall completed-session count this position corresponds to. */
  sessionNumber: number;
  /** True once the whole block is finished. */
  done: boolean;
}

/**
 * Resolve the next session to train from how many have been completed.
 * Walks the (week × day) grid linearly. `sessionsPerWeek` is the size of
 * the session rotation; `totalWeeks` is the block length.
 */
export function nextProgramPosition(
  completedCount: number,
  sessionsPerWeek: number,
  totalWeeks: number,
): ProgramPosition {
  if (sessionsPerWeek <= 0 || totalWeeks <= 0) {
    return { weekIndex: 0, dayIndex: 0, sessionNumber: 0, done: true };
  }
  const total = sessionsPerWeek * totalWeeks;
  const clamped = Math.max(0, Math.min(completedCount, total));
  if (clamped >= total) {
    return { weekIndex: totalWeeks - 1, dayIndex: sessionsPerWeek - 1, sessionNumber: total, done: true };
  }
  return {
    weekIndex: Math.floor(clamped / sessionsPerWeek),
    dayIndex: clamped % sessionsPerWeek,
    sessionNumber: clamped,
    done: false,
  };
}

/** Fraction 0–1 of the block completed. */
export function programProgressFraction(
  completedCount: number,
  sessionsPerWeek: number,
  totalWeeks: number,
): number {
  const total = sessionsPerWeek * totalWeeks;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, completedCount) / total);
}

/**
 * Apply a week's load multiplier to a prescribed/suggested working weight,
 * rounding to the smallest available plate jump. A deload week's lower
 * `loadPct` automatically reduces the bar.
 */
export function applyWeekLoad(baseWeight: number, loadPct: number, increment: number): number {
  if (baseWeight <= 0) return 0;
  const scaled = baseWeight * loadPct;
  if (increment <= 0) return round(scaled);
  return round(Math.round(scaled / increment) * increment);
}

/** Human label for a week, honouring an explicit label and deload flag. */
export function weekLabel(weekIndex: number, label: string | null | undefined, isDeload: boolean): string {
  const base = label && label.trim() ? label.trim() : `Week ${weekIndex + 1}`;
  return isDeload ? `${base} · deload` : base;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
