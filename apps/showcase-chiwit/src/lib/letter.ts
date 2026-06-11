// Letter generator — weekly garden letters, no advice, no fabricated stats
import type { DayLog, MoodWord, Letter, ChiwitState } from './store';
import { localDate } from './store';

// Internal mood ranking — not exported
const MOOD_RANK: Record<string, number> = {
  heavy: 1,
  low: 2,
  okay: 3,
  light: 4,
  bright: 5,
};

export function getWeekBounds(date: Date = new Date()): { start: Date; end: Date } {
  // Returns the most recent COMPLETED Sunday-Saturday week (before the current week)
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  // Find last Saturday (end of most recent completed week)
  // If today is Sunday (0), last Saturday was yesterday (1 day ago)
  // If today is Saturday (6), the most recent completed Saturday was 7 days ago
  const daysToLastSat = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
  const end = new Date(date);
  end.setDate(date.getDate() - daysToLastSat);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(localDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function shortDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
}

function avgSleep(dayLogs: DayLog[]): number | null {
  const sleepHours: number[] = [];
  for (const day of dayLogs) {
    const entry = day.things['sleep'];
    if (!entry || entry.action !== 'done') continue;
    const m = (entry.detail ?? '').match(/^([\d.]+)h/);
    if (m) sleepHours.push(parseFloat(m[1]));
  }
  if (sleepHours.length === 0) return null;
  return sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length;
}

export function composeLetter(days: Record<string, DayLog>, weekEnding: string): Letter {
  // Derive week start from weekEnding (Saturday)
  const endDate = new Date(weekEnding + 'T00:00:00');
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  const weekStart = localDate(startDate);

  const allDates = dateRange(weekStart, weekEnding);
  const weekDays: DayLog[] = allDates
    .map((d) => days[d])
    .filter((d): d is DayLog => d !== undefined);

  const loggedCount = weekDays.length;
  const id = `letter:${weekEnding}`;

  // Pills
  const pills: string[] = [];

  // Movement pill
  const movedDays = weekDays.filter((d) =>
    Object.values(d.things).some((t) => t.kind === 'movement' && t.action === 'done'),
  ).length;
  if (movedDays > 0) {
    pills.push(`moved ${movedDays} ${movedDays === 1 ? 'day' : 'days'}`);
  }

  // Medication pill
  const medDays = weekDays.filter((d) => d.things['medication']).length;
  const medDone = weekDays.filter(
    (d) => d.things['medication']?.action === 'done',
  ).length;
  if (medDays > 0) {
    pills.push(`doses ${medDone}/${medDays}`);
  }

  // Sleep pill (only if logged)
  const sleepAvg = avgSleep(weekDays);
  if (sleepAvg !== null) {
    pills.push(`avg ${sleepAvg.toFixed(1)}h sleep`);
  }

  // Journal pill
  const journalDays = weekDays.filter((d) => d.journal.length > 0).length;
  if (journalDays > 0) {
    pills.push(`wrote ${journalDays} ${journalDays === 1 ? 'time' : 'times'}`);
  }

  // Arc (mood word for each day in the week)
  const arc: (MoodWord | null)[] = allDates.map((d) => days[d]?.mood ?? null);

  // Quiet week — not enough data
  if (loggedCount < 2) {
    const body = [
      `A quieter week — ${loggedCount} ${loggedCount === 1 ? 'day' : 'days'} logged, and that's fine. The garden keeps growing either way.`,
      'Small things, most days — that\'s how a week like this gets built.',
    ].join('\n\n');
    return { id, weekEnding, body, pills, arc };
  }

  // Build sentences
  const sentences: string[] = [];

  // Find heavier days
  const heavierDays = weekDays.filter(
    (d) => d.mood === 'heavy' || d.mood === 'low',
  );
  const lighterDays = weekDays.filter(
    (d) => d.mood === 'light' || d.mood === 'bright',
  );

  if (heavierDays.length > 0) {
    const heavyDay = heavierDays[0];
    const dayName = shortDayName(heavyDay.date);

    // Journal clause
    let journalClause = '';
    if (heavyDay.journal.length > 0) {
      const fragment = heavyDay.journal[0].text.slice(0, 40).trim();
      journalClause = `you wrote "${fragment}" on ${dayName} night, which tracks. `;
    }

    // Movement clause
    const movedOnHeavyDay = Object.values(heavyDay.things).some(
      (t) => t.kind === 'movement' && t.action === 'done',
    );
    let movedClause: string;
    if (movedOnHeavyDay) {
      movedClause = `you walked ${dayName} anyway. That's a thing you do, apparently, even when it's hard.`;
    } else {
      movedClause = 'the week carried you through.';
    }

    const dayNames = heavierDays.length === 1
      ? dayName
      : heavierDays.map((d) => shortDayName(d.date)).join(' and ');

    sentences.push(
      `You had a heavier ${dayNames} — ${journalClause}But ${movedClause}`,
    );
  }

  // Lighter stretch
  if (lighterDays.length >= 2) {
    // Check for consecutive lighter days
    const sortedLighter = lighterDays.sort((a, b) => a.date.localeCompare(b.date));
    let consecutiveStart: string | null = null;
    let consecutiveCount = 1;

    for (let i = 1; i < sortedLighter.length; i++) {
      const prev = new Date(sortedLighter[i - 1].date + 'T00:00:00');
      const curr = new Date(sortedLighter[i].date + 'T00:00:00');
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        consecutiveCount++;
        if (consecutiveCount >= 2 && consecutiveStart === null) {
          consecutiveStart = sortedLighter[i - 1].date;
        }
      } else {
        consecutiveCount = 1;
      }
    }

    if (consecutiveStart) {
      sentences.push(
        `Your evenings ran lighter from ${shortDayName(consecutiveStart)} onwards.`,
      );
    }
  }

  // If no notable patterns found, add a general sentence
  if (sentences.length === 0) {
    const moodsLogged = weekDays.filter((d) => d.mood).length;
    if (moodsLogged > 0) {
      sentences.push(
        `You showed up ${loggedCount} ${loggedCount === 1 ? 'day' : 'days'} this week — that's the whole thing, really.`,
      );
    } else {
      sentences.push(
        `A quieter week — ${loggedCount} ${loggedCount === 1 ? 'day' : 'days'} logged, and that's fine. The garden keeps growing either way.`,
      );
    }
  }

  sentences.push("Small things, most days — that's how a week like this gets built.");

  return {
    id,
    weekEnding,
    body: sentences.join('\n\n'),
    pills,
    arc,
  };
}

export function maybeGenerateLetter(state: ChiwitState): ChiwitState {
  const { start, end } = getWeekBounds();
  const weekEnding = localDate(end);

  // Check if we already have a letter for this week
  const alreadyHas = state.letters.some((l) => l.weekEnding === weekEnding);
  if (alreadyHas) return state;

  const letter = composeLetter(state.days, weekEnding);
  return {
    ...state,
    letters: [...state.letters, letter],
  };
}
