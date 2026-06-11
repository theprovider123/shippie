// Sentence parser — converts free-text day entries into structured items
import type { MoodWord } from './store';

export type ParsedItem =
  | { kind: 'medication'; phrase: string; action: 'done' | 'skipped'; detail?: string }
  | { kind: 'sleep'; phrase: string; action: 'done'; detail: string }
  | { kind: 'movement'; phrase: string; action: 'done'; detail?: string }
  | { kind: 'water'; phrase: string; action: 'done'; count: number; detail?: string }
  | { kind: 'mood'; phrase: string; mood: MoodWord };

// Number word → digit table
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// Fractional word segments → decimal part
const FRACTION_WORDS: Record<string, number> = {
  'and a half': 0.5,
  'and a quarter': 0.25,
  'and three quarters': 0.75,
  'and three-quarters': 0.75,
};

function parseSleepHours(text: string): number | null {
  const lower = text.toLowerCase();

  // Try "X and a half hours", "X and a quarter hours" etc.
  for (const [fracPhrase, fracVal] of Object.entries(FRACTION_WORDS)) {
    for (const [word, whole] of Object.entries(NUMBER_WORDS)) {
      const pattern = new RegExp(`${word}\\s+${fracPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (pattern.test(lower)) {
        return whole + fracVal;
      }
    }
    // Also numeric + fraction: "6 and a half"
    const numFrac = new RegExp(`(\\d+(?:\\.\\d+)?)\\s+${fracPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const m = lower.match(numFrac);
    if (m) {
      return parseFloat(m[1]) + fracVal;
    }
  }

  // Try word numbers: "seven hours"
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      return val;
    }
  }

  // Try numeric: "7.5 hours" or "7 hours"
  const numMatch = lower.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

function parseSleepPhrase(text: string): { phrase: string; hours: number } | null {
  // Look for patterns like "slept about X hours" or "slept X hours"
  const sleepRegex = /slept\s+(?:about\s+|around\s+|roughly\s+)?([\w\s.]+?)\s*hours?/i;
  const m = text.match(sleepRegex);
  if (m) {
    const fragment = m[0];
    const hours = parseSleepHours(m[1] + ' hours');
    if (hours !== null) {
      return { phrase: fragment, hours };
    }
  }

  // Broader: "about X hours of sleep" / "X hours sleep"
  const altRegex = /(?:about\s+|around\s+|roughly\s+)?([\w\s.]+?)\s*hours?\s*(?:of\s+)?sleep/i;
  const m2 = text.match(altRegex);
  if (m2) {
    const fragment = m2[0];
    const hours = parseSleepHours(m2[1] + ' hours');
    if (hours !== null) {
      return { phrase: fragment, hours };
    }
  }

  return null;
}

// Count words for water
const COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  a: 1,
};

export function parseDayText(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const lower = text.toLowerCase();

  // --- Medication ---
  if (/skipped\s+(?:my\s+)?meds?/i.test(text)) {
    const m = text.match(/skipped\s+(?:my\s+)?(meds?[^,.…]*)/i);
    items.push({
      kind: 'medication',
      phrase: m ? m[0] : 'skipped meds',
      action: 'skipped',
    });
  } else if (/took\s+(?:my\s+)?meds?/i.test(text)) {
    const m = text.match(/took\s+(?:my\s+)?(meds?[^,.…]*)/i);
    items.push({
      kind: 'medication',
      phrase: m ? m[0] : 'took meds',
      action: 'done',
      detail: 'this morning',
    });
  }

  // --- Sleep ---
  const sleepResult = parseSleepPhrase(text);
  if (sleepResult) {
    const { phrase, hours } = sleepResult;
    const hStr = Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
    items.push({
      kind: 'sleep',
      phrase,
      action: 'done',
      detail: hStr,
    });
  }

  // --- Movement ---
  const movementPatterns = [
    /\b(walked?|walk(?:ing)?)\b(?:\s+(?:over\s+)?(?:to|at|around|in)\s+\w+(?:\s+\w+)?)?/i,
    /\b(ran?|running)\b(?:\s+\w+(?:\s+\w+)?)?/i,
    /\b(yoga)\b(?:\s+\w+(?:\s+\w+)?)?/i,
    /\b(gym)\b(?:\s+\w+(?:\s+\w+)?)?/i,
    /\b(studio)\b/i,
  ];

  for (const pattern of movementPatterns) {
    const m = text.match(pattern);
    if (m) {
      // Get a reasonable phrase around the movement word
      // Try to capture "walked over to the studio" type phrases
      const walkPhrase = text.match(
        /walk(?:ed|ing)?\s+(?:over\s+)?(?:to|at|around|in)\s+(?:the\s+)?\w+/i,
      );
      const runPhrase = text.match(/ran?\s+(?:\w+\s+){0,3}/i);
      const phrase = walkPhrase ? walkPhrase[0].trim()
        : runPhrase ? runPhrase[0].trim()
        : m[0].trim();

      items.push({
        kind: 'movement',
        phrase,
        action: 'done',
      });
      break;
    }
  }

  // --- Water ---
  const waterRegex = /(\b(?:one|two|three|four|five|a)\b)\s+(?:glass(?:es)?|cup(?:s)?|bottle(?:s)?)\s+of\s+water/i;
  const waterMatch = text.match(waterRegex);
  if (waterMatch) {
    const countWord = waterMatch[1].toLowerCase();
    const count = COUNT_WORDS[countWord] ?? 1;
    items.push({
      kind: 'water',
      phrase: waterMatch[0],
      action: 'done',
      count,
    });
  } else {
    // Also handle "water" standalone mentions without count phrase
    const waterSimple = text.match(/(\d+)\s+(?:glass(?:es)?|cup(?:s)?)\s+(?:of\s+)?water/i);
    if (waterSimple) {
      items.push({
        kind: 'water',
        phrase: waterSimple[0],
        action: 'done',
        count: parseInt(waterSimple[1], 10),
      });
    }
  }

  // --- Mood ---
  type MoodRule = { pattern: RegExp; mood: MoodWord };
  const moodRules: MoodRule[] = [
    { pattern: /somewhere\s+in\s+the\s+middle/i, mood: 'okay' },
    { pattern: /feeling\s+okay/i, mood: 'okay' },
    { pattern: /\brough\b/i, mood: 'heavy' },
    { pattern: /\bheavy\b/i, mood: 'heavy' },
    { pattern: /\bgreat\b/i, mood: 'bright' },
    { pattern: /\bgood\b/i, mood: 'light' },
    { pattern: /\bbright\b/i, mood: 'bright' },
    { pattern: /\blight\b/i, mood: 'light' },
    { pattern: /\blow\b/i, mood: 'low' },
    { pattern: /\bflat\b/i, mood: 'low' },
    { pattern: /\bokay\b/i, mood: 'okay' },
    { pattern: /\bok\b/i, mood: 'okay' },
  ];

  for (const rule of moodRules) {
    const m = text.match(rule.pattern);
    if (m) {
      items.push({
        kind: 'mood',
        phrase: m[0],
        mood: rule.mood,
      });
      break;
    }
  }

  return items;
}
