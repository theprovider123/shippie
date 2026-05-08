/**
 * Weekly review synthesiser.
 *
 * The "Sunday morning" surface. Walks the people + touches + tasks and
 * produces three buckets:
 *
 *  • gone-quiet  — people you haven't touched in 6+ weeks (and care about)
 *  • positive    — people whose last touch in the past 14 days was '+'
 *  • dueActions  — open tasks past their due_at (or due today)
 *
 * No machine-learning, no "engagement score". This is just calendar
 * arithmetic with a friendly shape — exactly what a paper Rolodex
 * would tell you if it knew the date.
 */
import type { Person, Task, Touch } from '../db/schema.ts';

const MS_PER_DAY = 86_400_000;
export const QUIET_THRESHOLD_DAYS = 42; // "6 weeks"
export const POSITIVE_RECENT_DAYS = 14;

export interface ReviewItem {
  person: Person;
  /** ISO timestamp the last touch happened (if any). */
  lastTouchAt: string | null;
  /** Days since last touch — used for sorting + display. */
  daysSinceLastTouch: number | null;
  /** Most recent touch summary, where useful. */
  lastSummary?: string;
}

export interface ReviewResult {
  goneQuiet: ReviewItem[];
  positive: ReviewItem[];
  dueActions: Array<{ task: Task; person: Person | null }>;
  /** ISO timestamp this review was generated. */
  generatedAt: string;
}

function lastTouchFor(personId: string, touches: Touch[]): Touch | undefined {
  let latest: Touch | undefined;
  for (const t of touches) {
    if (t.person_id !== personId) continue;
    if (!latest) {
      latest = t;
      continue;
    }
    if (
      new Date(t.happened_at ?? 0).getTime() > new Date(latest.happened_at ?? 0).getTime()
    ) {
      latest = t;
    }
  }
  return latest;
}

function daysBetween(a: number, b: number): number {
  return Math.floor((b - a) / MS_PER_DAY);
}

export interface ReviewInput {
  people: Person[];
  touches: Touch[];
  tasks: Task[];
  now?: Date;
}

export function synthesise({ people, touches, tasks, now = new Date() }: ReviewInput): ReviewResult {
  const nowMs = now.getTime();
  const goneQuiet: ReviewItem[] = [];
  const positive: ReviewItem[] = [];

  for (const person of people) {
    if (person.archived) continue;
    const last = lastTouchFor(person.id, touches);
    const lastTouchAt = last?.happened_at ?? null;
    const lastMs = lastTouchAt ? new Date(lastTouchAt).getTime() : null;
    const daysSinceLastTouch = lastMs ? daysBetween(lastMs, nowMs) : null;

    // gone-quiet: no touches at all OR last touch > QUIET_THRESHOLD_DAYS ago
    if (daysSinceLastTouch === null || daysSinceLastTouch >= QUIET_THRESHOLD_DAYS) {
      goneQuiet.push({
        person,
        lastTouchAt,
        daysSinceLastTouch,
        lastSummary: last?.summary,
      });
      continue; // can't be both quiet and positive-recent
    }

    // positive-recent: last touch in past N days, sentiment '+'
    if (
      daysSinceLastTouch <= POSITIVE_RECENT_DAYS &&
      last?.sentiment === '+'
    ) {
      positive.push({
        person,
        lastTouchAt,
        daysSinceLastTouch,
        lastSummary: last.summary,
      });
    }
  }

  // Sort gone-quiet: oldest first (longest silence at the top, with
  // "no touches yet" sorting as the most-overdue).
  goneQuiet.sort((a, b) => {
    const ax = a.daysSinceLastTouch ?? Number.POSITIVE_INFINITY;
    const bx = b.daysSinceLastTouch ?? Number.POSITIVE_INFINITY;
    return bx - ax;
  });

  // Sort positive: most recent first (you talked to them, freshest at top).
  positive.sort(
    (a, b) => (a.daysSinceLastTouch ?? 0) - (b.daysSinceLastTouch ?? 0),
  );

  const dueActions = tasks
    .filter((t) => !t.done_at)
    .filter((t) => {
      if (!t.due_at) return false;
      const due = new Date(t.due_at).getTime();
      if (Number.isNaN(due)) return false;
      return due <= nowMs + MS_PER_DAY; // due today or past
    })
    .sort((a, b) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime())
    .map((task) => ({
      task,
      person: people.find((p) => p.id === task.person_id) ?? null,
    }));

  return {
    goneQuiet,
    positive,
    dueActions,
    generatedAt: now.toISOString(),
  };
}
