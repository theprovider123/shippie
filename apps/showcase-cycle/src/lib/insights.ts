/**
 * Insights — personal pattern detection over the user's own logs.
 *
 * Bodily literacy is the reward loop: after a couple of cycles, show patterns
 * the person might not have noticed — symptom clustering by cycle day, a
 * premenstrual mood/energy dip, and cycle variability. Everything is computed
 * locally from this device's records; nothing is sent anywhere. Pure functions
 * so the math is unit-testable.
 *
 * Honest by construction: patterns need a minimum sample and carry a
 * confidence. We never imply causation ("X causes Y"), only co-occurrence.
 */
import { daysBetween, parseSymptoms } from '../db/queries.ts';
import { classifyConfidence, recentCycleLengths } from './predict.ts';
import { SYMPTOM_LABELS, type Cycle, type Day, type SymptomKey } from '../db/schema.ts';

export interface Insight {
  id: string;
  kind: 'variability' | 'symptom-cluster' | 'premenstrual';
  text: string;
  confidence: 'low' | 'medium' | 'high';
}

const MIN_SYMPTOM_OCCURRENCES = 3;

/** Day-number within its cycle (1-indexed), or null if it predates the cycle. */
function cycleDayOf(cycles: Cycle[], day: Day): number | null {
  const cycle = cycles.find((c) => c.id === day.cycle_id);
  if (!cycle) return null;
  const diff = daysBetween(cycle.started_on, day.date);
  return diff >= 0 ? diff + 1 : null;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Cycle-length variability — the honest backbone of "prediction, not certainty". */
export function variabilityInsight(cycles: Cycle[]): Insight | null {
  const lengths = recentCycleLengths(cycles);
  if (lengths.length < 2) return null;
  const m = mean(lengths);
  const sd = Math.sqrt(mean(lengths.map((l) => (l - m) ** 2)));
  const conf = classifyConfidence(sd);
  const spread = Math.round(sd) || 1;
  return {
    id: 'variability',
    kind: 'variability',
    confidence: conf,
    text:
      sd <= 2
        ? `Your recent cycles are fairly regular — around ${Math.round(m)} days, give or take ${spread}.`
        : `Your cycles vary by about ±${spread} days (mean ${Math.round(m)}). That's normal for many people — predictions stay a range, not a date.`,
  };
}

/** Which cycle days a symptom tends to cluster on. */
export function symptomClusterInsights(cycles: Cycle[], days: Day[]): Insight[] {
  const bySymptom = new Map<SymptomKey, number[]>();
  for (const day of days) {
    const cd = cycleDayOf(cycles, day);
    if (cd == null) continue;
    for (const s of parseSymptoms(day.symptoms_json ?? null)) {
      const arr = bySymptom.get(s) ?? [];
      arr.push(cd);
      bySymptom.set(s, arr);
    }
  }
  const out: Insight[] = [];
  for (const [symptom, daysList] of bySymptom) {
    if (daysList.length < MIN_SYMPTOM_OCCURRENCES) continue;
    const sorted = [...daysList].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.25)]!;
    const hi = sorted[Math.floor(sorted.length * 0.75)]!;
    const range = lo === hi ? `day ${lo}` : `days ${lo}–${hi}`;
    out.push({
      id: `cluster-${symptom}`,
      kind: 'symptom-cluster',
      confidence: daysList.length >= 6 ? 'high' : 'medium',
      text: `${cap(SYMPTOM_LABELS[symptom])} usually shows up around ${range} of your cycle (${daysList.length} times logged).`,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** A premenstrual mood/energy dip in the days before a period. */
export function premenstrualInsight(cycles: Cycle[], days: Day[]): Insight | null {
  // Use completed cycles only (they have a known length via the next start).
  const lengths = recentCycleLengths(cycles);
  if (lengths.length < 2) return null;
  const avgLen = Math.round(mean(lengths));
  const lateMoods: number[] = [];
  const earlyMoods: number[] = [];
  for (const day of days) {
    const cd = cycleDayOf(cycles, day);
    if (cd == null || typeof day.mood !== 'number') continue;
    if (cd >= avgLen - 4) lateMoods.push(day.mood);
    else if (cd <= avgLen - 8) earlyMoods.push(day.mood);
  }
  if (lateMoods.length < 3 || earlyMoods.length < 3) return null;
  const drop = mean(earlyMoods) - mean(lateMoods);
  if (drop < 0.6) return null;
  return {
    id: 'premenstrual-mood',
    kind: 'premenstrual',
    confidence: lateMoods.length >= 6 ? 'medium' : 'low',
    text: `Mood tends to read lower in the ~5 days before your period than earlier in the cycle. Co-occurrence, not a verdict — worth watching.`,
  };
}

export function detectPatterns(cycles: Cycle[], days: Day[]): Insight[] {
  return [
    variabilityInsight(cycles),
    premenstrualInsight(cycles, days),
    ...symptomClusterInsights(cycles, days),
  ].filter((x): x is Insight => x !== null);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
