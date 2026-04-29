/**
 * Pure intent-matching logic, extracted from App.tsx so it can be tested
 * without mounting React. The component delegates to this on every
 * `shippie.intent` event.
 */

export interface HabitForMatch {
  id: string;
  intent?: 'cooked-meal' | 'workout-completed';
}

export interface CheckForMatch {
  habitId: string;
  checkedAt: string;
}

/**
 * Compute the habit ids that should auto-check today given an incoming
 * intent. Skips habits that already have a check for today.
 */
export function habitsToAutoCheck(
  intent: string,
  habits: readonly HabitForMatch[],
  existingChecks: readonly CheckForMatch[],
  today: string,
): readonly string[] {
  const matched = habits.filter((h) => h.intent === intent);
  if (matched.length === 0) return [];
  const alreadyToday = new Set(
    existingChecks
      .filter((c) => c.checkedAt.slice(0, 10) === today)
      .map((c) => c.habitId),
  );
  return matched.map((h) => h.id).filter((id) => !alreadyToday.has(id));
}
