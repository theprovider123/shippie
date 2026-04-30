/**
 * Daily journal prompts. Deterministic by date so both phones see
 * the same prompt for the same day with no coordination.
 *
 * Keep the bank big enough that the wraparound is gentle (≥ 60 → ~2
 * months between repeats).
 */
const PROMPTS: ReadonlyArray<string> = [
  "What did the light look like today?",
  "Three small kindnesses you noticed.",
  "Something they said that's still in your head.",
  "What you ate, who made it, what you talked about.",
  "An unexpected sound today.",
  "Where did your mind drift?",
  "Something you almost forgot to do.",
  "What's been making you laugh lately?",
  "What's one thing you'd save from today?",
  "A memory that surfaced.",
  "What did you walk past that you usually walk past?",
  "If today were a colour, what colour?",
  "A small win.",
  "Something you're carrying that's not yours.",
  "What did your hands do today?",
  "What's been gentle on you?",
  "A texture you noticed — fabric, paper, skin, stone.",
  "Who are you missing right now?",
  "Something you're looking forward to this week.",
  "A song that played at the right moment.",
  "What did you read or watch — what stuck?",
  "A meal you'd want to repeat.",
  "An old habit that came back today.",
  "Something you wish you'd said.",
  "Where did you sit for the longest?",
  "A scent today.",
  "Something that felt foreign.",
  "Something that felt familiar.",
  "A word you used today that you don't usually use.",
  "What did the weather do to you?",
  "Something you saw on a screen that lingered.",
  "A small worry.",
  "A small relief.",
  "Who did you talk to first today?",
  "Who did you talk to last?",
  "What did you postpone?",
  "What did you make happen?",
  "What did you wear, and why?",
  "An unfinished thought.",
  "A gesture from them you'd never want to lose.",
  "If you were writing them a postcard from today, one sentence.",
  "What's the slowest moment you had?",
  "What's the fastest?",
  "An animal you saw.",
  "Something you held in your hand for more than ten seconds.",
  "A song you wanted to share with them.",
  "A photo you didn't take but wish you had.",
  "Something you bought.",
  "Something you almost bought and didn't.",
  "A worry that turned out to be nothing.",
  "Where did you walk today?",
  "What was on the table when you sat down?",
  "What did you give away?",
  "What did you receive?",
  "An apology you owe — to yourself or someone else.",
  "A feeling you don't have a word for.",
  "A small superstition.",
  "A boundary you held.",
  "A boundary you let go of.",
  "Something small they did for you.",
  "Something small you did for them.",
  "What's true about today that wasn't true yesterday?",
];

/**
 * Daily-stable prompt for a given local date string (YYYY-MM-DD).
 * Same input → same prompt. djb2 hash mod bank size.
 */
export function promptForDate(localDate: string): string {
  let h = 5381;
  for (let i = 0; i < localDate.length; i++) {
    h = ((h << 5) + h) ^ localDate.charCodeAt(i);
  }
  const idx = (h >>> 0) % PROMPTS.length;
  return PROMPTS[idx]!;
}
