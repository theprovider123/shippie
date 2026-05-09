/**
 * Versioned question bank. The bank version is part of every emitted
 * question_id (e.g. `wyr-2026-05-09-v1`) so that subsequent edits to
 * the bank don't rewrite history — a person who answered yesterday's
 * question keeps their answer attributed to the version they saw.
 */

export const BANK_VERSION = 'v1';

export interface Question {
  a: string;
  b: string;
}

// 60 questions cycled deterministically by date. Light, social, no
// edge cases — the goal is enjoyable daily play, not psychometrics.
export const QUESTIONS: ReadonlyArray<Question> = [
  { a: 'Always be 10 min early', b: 'Always be 10 min late' },
  { a: 'See into the future', b: 'See into the past' },
  { a: 'Read minds', b: 'Be invisible' },
  { a: 'Live in a city', b: 'Live in the country' },
  { a: 'Coffee', b: 'Tea' },
  { a: 'Mountains', b: 'Beach' },
  { a: 'Sweet', b: 'Savoury' },
  { a: 'Fly', b: 'Teleport' },
  { a: 'No music for a year', b: 'No films for a year' },
  { a: 'Cook every meal', b: 'Eat out every meal' },
  { a: 'Summer forever', b: 'Winter forever' },
  { a: 'Speak every language', b: 'Play every instrument' },
  { a: 'A pet that talks', b: 'A pet that flies' },
  { a: 'Be famous', b: 'Be wealthy' },
  { a: 'Lose your phone for a week', b: 'Lose your wallet for a week' },
  { a: 'Have to sing everything', b: 'Have to whisper everything' },
  { a: 'Live without sugar', b: 'Live without salt' },
  { a: 'Books', b: 'Podcasts' },
  { a: 'Morning person', b: 'Night owl' },
  { a: 'Never get a sunburn', b: 'Never get a hangover' },
  { a: 'Forget every film', b: 'Forget every book' },
  { a: 'Camping in the woods', b: 'Hotel in a city' },
  { a: 'Pause time', b: 'Rewind 10 seconds' },
  { a: 'Hand-write everything', b: 'Voice-dictate everything' },
  { a: 'No internet at home', b: 'No internet at work' },
  { a: 'A vegetable garden', b: 'A flower garden' },
  { a: 'Train', b: 'Plane' },
  { a: 'A dinner party for 4', b: 'A dance floor of 40' },
  { a: 'Fresh bread daily', b: 'Fresh pasta daily' },
  { a: 'Rain', b: 'Snow' },
  { a: 'Walk everywhere', b: 'Cycle everywhere' },
  { a: 'Live by the sea', b: 'Live by a river' },
  { a: 'A handwritten letter', b: 'A long phone call' },
  { a: 'A garden', b: 'A balcony with a view' },
  { a: 'Make people laugh', b: 'Make people think' },
  { a: 'Improvise', b: 'Plan everything' },
  { a: 'Loud restaurant', b: 'Quiet restaurant' },
  { a: 'New shoes every year', b: 'New jacket every year' },
  { a: 'Trip with one friend', b: 'Trip with five friends' },
  { a: 'Hot chocolate', b: 'Mulled wine' },
  { a: 'Live in a tiny home', b: 'Live in a houseboat' },
  { a: 'Skill: drawing', b: 'Skill: dancing' },
  { a: 'Live with a dog', b: 'Live with a cat' },
  { a: 'No social media for a year', b: 'No takeout for a year' },
  { a: 'Cook for 12', b: 'Cook for 1' },
  { a: 'Open kitchen', b: 'Closed kitchen' },
  { a: 'Buy used', b: 'Buy new' },
  { a: 'Always know the time', b: 'Always know the weather' },
  { a: 'Run a marathon', b: 'Climb a mountain' },
  { a: 'A small bookshop', b: 'A small bakery' },
  { a: 'A long bath', b: 'A long walk' },
  { a: 'Vinyl', b: 'Streaming' },
  { a: 'A roof terrace', b: 'A back garden' },
  { a: 'Picnic in the park', b: 'Brunch in a café' },
  { a: 'Snow day', b: 'Sunny day off' },
  { a: 'A sketchbook', b: 'A notebook' },
  { a: 'Three good friends', b: 'Twenty acquaintances' },
  { a: 'Bake a loaf', b: 'Brew a beer' },
  { a: 'Wake to birdsong', b: 'Wake to ocean waves' },
  { a: 'Solo road trip', b: 'Group hike' },
];

export interface DailyQuestion extends Question {
  question_id: string;       // e.g. wyr-2026-05-09-v1
  date: string;              // YYYY-MM-DD
}

export function questionForDate(date: string): DailyQuestion {
  // Deterministic hash from date → index. Uses simple djb2.
  let h = 5381;
  for (let i = 0; i < date.length; i++) h = ((h * 33) ^ date.charCodeAt(i)) >>> 0;
  const idx = h % QUESTIONS.length;
  const q = QUESTIONS[idx] ?? QUESTIONS[0]!;
  return {
    question_id: `wyr-${date}-${BANK_VERSION}`,
    date,
    a: q.a,
    b: q.b,
  };
}

export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
