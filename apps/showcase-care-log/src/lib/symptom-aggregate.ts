/**
 * symptom-aggregate.ts — pure rollups over the symptom log.
 *
 * Used by the report and home pages. No Yjs dependency — call sites
 * pass a flat array.
 */
import type { SymptomEntry } from '../sync/care-doc.ts';
import { isoDateOf } from '../sync/care-doc.ts';

export interface DailyRollup {
  iso: string;
  /** Map of label → entries for that label that day. */
  byLabel: Map<string, SymptomEntry[]>;
  /** Total count of all entries on the day. */
  count: number;
}

/**
 * Group symptoms by ISO date (recipient's calendar day, local time).
 * Returns an array sorted oldest-first.
 */
export function groupByDay(entries: readonly SymptomEntry[]): DailyRollup[] {
  const buckets = new Map<string, DailyRollup>();
  for (const e of entries) {
    const iso = isoDateOf(new Date(e.occurred_at));
    let bucket = buckets.get(iso);
    if (!bucket) {
      bucket = { iso, byLabel: new Map(), count: 0 };
      buckets.set(iso, bucket);
    }
    const list = bucket.byLabel.get(e.label) ?? [];
    list.push(e);
    bucket.byLabel.set(e.label, list);
    bucket.count += 1;
  }
  return [...buckets.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Average intensity for a label over a list of entries. Skips
 * entries with intensity 0 (the "yes/observed without intensity" sentinel).
 *
 * Returns null when no scored entries are present.
 */
export function intensityAverage(entries: readonly SymptomEntry[], label: string): number | null {
  const scored = entries.filter((e) => e.label === label && e.intensity >= 1);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, e) => acc + e.intensity, 0);
  return sum / scored.length;
}

/**
 * Distinct labels seen in the entry list, sorted by frequency (most
 * frequent first) then alphabetically as a tiebreaker.
 */
export function distinctLabels(entries: readonly SymptomEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}
