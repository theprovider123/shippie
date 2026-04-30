/**
 * Daily Questions — one prompt per day, both write privately, answers
 * unlock to each other once both have answered.
 *
 * Bank is deterministic per local-date. Bank is large enough to give
 * ~3 months between repeats.
 *
 * Y.Map shape:
 *   answers: Record<dateString, Record<deviceId, string>>
 */
import * as Y from 'yjs';

export const DAILY_BANK: ReadonlyArray<string> = [
  'What were you doing the day we met?',
  'What about today felt familiar?',
  "What's something I've changed about you?",
  'A small thing I do that you love.',
  'A small thing I do that drives you up the wall.',
  'Where do you want to be a year from now?',
  'Where do you want to be five years from now?',
  'What was the best meal you ever had?',
  'What was the worst date you ever had?',
  "What's a song you can't hear without thinking of me?",
  'What was your bedroom like as a teenager?',
  "What's something you wish you'd asked me by now?",
  "What's something you'd never want to do without me?",
  "What's something you wish I knew about you?",
  'A scent that brings me back to you.',
  'When did you first know?',
  "What's a stupid argument you remember winning?",
  "What's a stupid argument you remember losing?",
  'A place we went that you want to go back to.',
  'A place we went that you never need to see again.',
  'What were you afraid of as a kid?',
  'What are you afraid of now?',
  "What's something you've always wanted to learn?",
  "What's something I've taught you?",
  'A teacher who mattered.',
  'A friend you miss.',
  "What's the worst job you ever had?",
  'A book that made you cry.',
  'A film you secretly love.',
  "What's the most romantic thing I've ever done?",
  "What's the most romantic thing you've ever done for someone else?",
  'What did you want to be when you grew up?',
  'A holiday you remember from childhood.',
  'A taste from your childhood I should try.',
  'A skill you wish you had.',
  'A skill you have but never use.',
  "What's the longest you've gone without seeing me?",
  'What did the inside of your hand smell like as a child?',
  "What's something kind a stranger did for you?",
  "What's something you regret about how we started?",
  'What time of day do you feel most yourself?',
  "What's the bravest thing you've ever done?",
  'What was your first job?',
  "What's a question you've been afraid to ask me?",
  'A small ritual I have that you find adorable.',
  'A small ritual you have that you think I haven\'t noticed.',
  'What does home smell like, for you?',
  "Tell me something you've never told anyone.",
  'Where did you imagine your life would be by now?',
  'Are we going where you thought we would?',
  'What about us has surprised you?',
  'What about us has been exactly what you hoped?',
  'A childhood photo of yours you wish you could show me.',
  "What's a piece of clothing you always feel like yourself in?",
  'A meal you cooked that you were proud of.',
  'A movie scene you can watch on loop.',
  'A book you re-read.',
  'An album you never get bored of.',
  'A friend you wish I knew better.',
  'A family member you wish I knew at all.',
  'What season feels most like you?',
  'A walk you take when you need to think.',
  'A pattern in your life you only just spotted.',
  "What's something you've forgiven yourself for?",
  "What's something you haven't?",
  'A compliment that landed harder than expected.',
  'A compliment that didn\'t.',
  'A small extravagance you never feel guilty about.',
  "What's a thing you'd save in a fire (besides me)?",
  'A piece of furniture in your home you love.',
  "What's a small thing I could do to make today better?",
  'When were you happiest this year?',
  'What were you doing when you laughed hardest this year?',
];

interface DailyRecord {
  answers: Record<string, Record<string, string>>;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('daily');
}

export function readDaily(doc: Y.Doc): DailyRecord {
  const m = getMap(doc);
  return {
    answers:
      (m.get('answers') as Record<string, Record<string, string>> | undefined) ?? {},
  };
}

export function answerDaily(
  doc: Y.Doc,
  date: string,
  deviceId: string,
  answer: string,
): void {
  const m = getMap(doc);
  const existing = (m.get('answers') as Record<string, Record<string, string>> | undefined) ?? {};
  const forDay = { ...(existing[date] ?? {}) };
  forDay[deviceId] = answer;
  m.set('answers', { ...existing, [date]: forDay });
}

/** Deterministic per-date prompt selection. djb2 hash mod bank size. */
export function questionForDate(localDate: string): { id: string; text: string } {
  let h = 5381;
  for (let i = 0; i < localDate.length; i++) {
    h = ((h << 5) + h) ^ localDate.charCodeAt(i);
  }
  const idx = (h >>> 0) % DAILY_BANK.length;
  return { id: `daily-${idx}`, text: DAILY_BANK[idx]! };
}
