// Pure observation engine — no streak mechanics, no numeric mood exports
import type { DayLog, AmbientEvent } from './store';

export const MIN_EVIDENCE = 7;

export interface Observation {
  id: string;
  icon: string; // emoji
  text: string;
  evidence: string;
  microcopy: string; // MUST end with "just something noticed" or "worth knowing, nothing more"
}

// Mood ranking is ONLY used internally in this module — never exported
const MOOD_RANK: Record<string, number> = {
  heavy: 1,
  low: 2,
  okay: 3,
  light: 4,
  bright: 5,
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Rule 1: Movement–mood correlation
function movementMood(
  days: Record<string, DayLog>,
  dismissed: string[],
): Observation | null {
  const id = 'obs:movement-mood';
  if (dismissed.includes(id)) return null;

  const movedWithMood: number[] = [];
  const stationaryWithMood: number[] = [];

  for (const day of Object.values(days)) {
    if (!day.mood) continue;
    const rank = MOOD_RANK[day.mood];
    if (rank === undefined) continue;
    const moved = Object.values(day.things).some(
      (t) => t.kind === 'movement' && t.action === 'done',
    );
    if (moved) {
      movedWithMood.push(rank);
    } else {
      stationaryWithMood.push(rank);
    }
  }

  if (movedWithMood.length + stationaryWithMood.length < MIN_EVIDENCE) return null;
  if (movedWithMood.length < 3 || stationaryWithMood.length < 3) return null;

  const movedAvg = avg(movedWithMood);
  const stationaryAvg = avg(stationaryWithMood);

  // Only surface if mood on moved days skews lighter
  if (movedAvg <= stationaryAvg) return null;

  return {
    id,
    icon: '🚶',
    text: 'Movement and lighter days tend to overlap for you.',
    evidence: `Across ${movedWithMood.length} days with movement logged, your mood averaged higher than on the ${stationaryWithMood.length} days without.`,
    microcopy: 'just something noticed',
  };
}

// Rule 2: Journal on heavy days
function journalHeavy(
  days: Record<string, DayLog>,
  dismissed: string[],
): Observation | null {
  const id = 'obs:journal-heavy';
  if (dismissed.includes(id)) return null;

  const heavyLowDays = Object.values(days).filter(
    (d) => d.mood === 'heavy' || d.mood === 'low',
  );

  if (heavyLowDays.length < MIN_EVIDENCE) return null;

  const journaledCount = heavyLowDays.filter((d) => d.journal.length > 0).length;
  if (journaledCount / heavyLowDays.length <= 0.5) return null;

  return {
    id,
    icon: '📓',
    text: 'You tend to write on harder days.',
    evidence: `On ${journaledCount} of your ${heavyLowDays.length} heavier or lower days, you opened the journal.`,
    microcopy: 'worth knowing, nothing more',
  };
}

// Rule 3: Late caffeine → short sleep
function coffeeSleep(
  days: Record<string, DayLog>,
  ambient: AmbientEvent[],
  dismissed: string[],
): Observation | null {
  const id = 'obs:coffee-sleep';
  if (dismissed.includes(id)) return null;

  // Find late caffeine events (after 15:00 local)
  const lateCoffeeByDate = new Set<string>();
  for (const event of ambient) {
    if (event.kind !== 'coffee-brewed' && event.kind !== 'caffeine-logged') continue;
    const d = new Date(event.at);
    if (d.getHours() >= 15) {
      const dateKey =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      lateCoffeeByDate.add(dateKey);
    }
  }

  // Find days with short sleep (<6.5h) where sleep was logged
  let coOccurrences = 0;
  for (const [date, day] of Object.entries(days)) {
    if (!lateCoffeeByDate.has(date)) continue;
    const sleepEntry = day.things['sleep'];
    if (!sleepEntry || sleepEntry.action !== 'done') continue;
    const detail = sleepEntry.detail ?? '';
    const match = detail.match(/^([\d.]+)h/);
    if (!match || !match[1]) continue;
    const hours = parseFloat(match[1]);
    if (hours < 6.5) coOccurrences++;
  }

  if (coOccurrences < 3) return null;

  return {
    id,
    icon: '☕',
    text: 'Late coffees seem to be shortening your sleep.',
    evidence: `${coOccurrences} times this week a late coffee was followed by less than 6.5 hours of sleep.`,
    microcopy: 'worth knowing, nothing more',
  };
}

export function computeObservations(
  days: Record<string, DayLog>,
  ambient: AmbientEvent[],
  dismissed: string[],
): Observation[] {
  const results: Observation[] = [];

  const mm = movementMood(days, dismissed);
  if (mm) results.push(mm);

  const jh = journalHeavy(days, dismissed);
  if (jh) results.push(jh);

  const cs = coffeeSleep(days, ambient, dismissed);
  if (cs) results.push(cs);

  return results;
}
