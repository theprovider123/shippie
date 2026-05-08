/**
 * Pure intent-matching logic, extracted from App.tsx so it can be tested
 * without mounting React. The component delegates to this on every
 * `shippie.intent` event.
 *
 * The matcher now handles the cue-routine-reward model: a habit is
 * eligible to auto-check only if it has `cue.intent === incoming` AND
 * `cue.autoCheck !== false`. Habits with a cue-anchor but `autoCheck`
 * disabled still surface a *prompt* via `cuesToFire` — the UI shows
 * "you just brewed coffee — your meditation cue" without ticking the
 * box for the user.
 */

export interface HabitForMatch {
  id: string;
  /**
   * Optional cue. When `intent` matches an incoming broadcast, the
   * habit is a candidate. `autoCheck=false` means "remind me, don't
   * tick for me".
   *
   * The legacy top-level `intent` field is still accepted for
   * backwards compatibility with the original showcase shape.
   */
  cue?: { intent?: string; autoCheck?: boolean };
  /** Legacy alias. Deprecated — prefer `cue.intent`. */
  intent?: string;
  /** Archived habits are inert — they neither auto-check nor prompt. */
  archivedAt?: string;
}

export interface CheckForMatch {
  habitId: string;
  checkedAt: string;
}

function intentOf(h: HabitForMatch): string | undefined {
  return h.cue?.intent ?? h.intent;
}

function autoCheckOf(h: HabitForMatch): boolean {
  // Default true preserves the original "auto-check on intent" behaviour
  // for legacy habits that only declare the top-level `intent` field.
  if (h.cue?.autoCheck === false) return false;
  return true;
}

/**
 * Compute the habit ids that should auto-check today given an incoming
 * intent. Skips habits that already have a check for today, archived
 * habits, and habits whose cue is set to "remind only".
 */
export function habitsToAutoCheck(
  intent: string,
  habits: readonly HabitForMatch[],
  existingChecks: readonly CheckForMatch[],
  today: string,
): readonly string[] {
  const matched = habits.filter(
    (h) => !h.archivedAt && intentOf(h) === intent && autoCheckOf(h),
  );
  if (matched.length === 0) return [];
  const alreadyToday = new Set(
    existingChecks
      .filter((c) => c.checkedAt.slice(0, 10) === today)
      .map((c) => c.habitId),
  );
  return matched.map((h) => h.id).filter((id) => !alreadyToday.has(id));
}

/**
 * Compute the habit ids whose cue should *prompt* (not tick) on this
 * intent. Used for the "you just brewed — your meditation cue" nudge.
 *
 * Includes habits where `autoCheck` is explicitly false. Skips already-
 * checked-today habits because the prompt would be redundant.
 */
export function cuesToFire(
  intent: string,
  habits: readonly HabitForMatch[],
  existingChecks: readonly CheckForMatch[],
  today: string,
): readonly string[] {
  const matched = habits.filter(
    (h) => !h.archivedAt && intentOf(h) === intent && !autoCheckOf(h),
  );
  if (matched.length === 0) return [];
  const alreadyToday = new Set(
    existingChecks
      .filter((c) => c.checkedAt.slice(0, 10) === today)
      .map((c) => c.habitId),
  );
  return matched.map((h) => h.id).filter((id) => !alreadyToday.has(id));
}
