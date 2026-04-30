/**
 * Anniversary detection — true if today's local MM-DD matches the
 * anniversary's MM-DD (year-agnostic). When true, the app swaps to
 * its love-coral palette via [data-anniversary="true"] on the root.
 */
import { toLocalDateString } from './dates.ts';

export function isAnniversaryToday(
  anniversaryIso: string | null,
  now: Date = new Date(),
): boolean {
  if (!anniversaryIso) return false;
  const ann = new Date(anniversaryIso);
  if (Number.isNaN(ann.getTime())) return false;
  const today = toLocalDateString(now);
  // Match MM-DD only — anniversary repeats every year.
  return today.slice(5) === toLocalDateString(ann).slice(5);
}

export function daysUntilNextAnniversary(
  anniversaryIso: string | null,
  now: Date = new Date(),
): number | null {
  if (!anniversaryIso) return null;
  const ann = new Date(anniversaryIso);
  if (Number.isNaN(ann.getTime())) return null;
  let candidate = new Date(now.getFullYear(), ann.getMonth(), ann.getDate());
  if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    candidate = new Date(now.getFullYear() + 1, ann.getMonth(), ann.getDate());
  }
  return Math.round((candidate.getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000);
}
