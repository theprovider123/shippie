/**
 * Pure correlation between sleep quality and same-day events.
 *
 * Returns a result only when there are 14+ overlapping days — per the
 * C2 acceptance criterion ("surfaces correlation only when 14+ days of
 * overlap exist"). Below that threshold, stay silent.
 *
 * Uses a simple Pearson correlation on event-count-per-day vs sleep
 * quality. We're not claiming causation — just surfacing the pattern.
 */

export interface SleepNight {
  /** YYYY-MM-DD */
  date: string;
  quality: number; // 1..10
}

export interface DatedEvent {
  /** Wall-clock ms when the event happened. */
  at: number;
}

export interface CorrelationResult {
  pearson: number;
  daysAnalysed: number;
}

const MIN_DAYS = 14;

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function correlateSleepWithEvents(
  nights: readonly SleepNight[],
  events: readonly DatedEvent[],
): CorrelationResult | null {
  // Count events per day.
  const counts = new Map<string, number>();
  for (const ev of events) {
    const k = dayKey(ev.at);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const overlap = nights.filter((n) => counts.has(n.date));
  if (overlap.length < MIN_DAYS) return null;

  const x = overlap.map((n) => counts.get(n.date) ?? 0);
  const y = overlap.map((n) => n.quality);
  const n = x.length;
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / n;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return { pearson: 0, daysAnalysed: n };
  return { pearson: num / denom, daysAnalysed: n };
}

export function describeCorrelation(r: CorrelationResult): string {
  const sign = r.pearson > 0 ? 'better' : 'worse';
  const abs = Math.abs(r.pearson);
  const strength = abs > 0.6 ? 'strong' : abs > 0.3 ? 'moderate' : 'mild';
  return `${strength} ${sign}-on-active-day pattern (r=${r.pearson.toFixed(2)} over ${r.daysAnalysed} days)`;
}
