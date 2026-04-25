/**
 * Rule-based category classifier. Counts keyword hits in the visible
 * text from `scanHtml.visibleText`. Highest hit count wins; confidence
 * = hits / keywordCount for that category. Below threshold → 'unknown'.
 *
 * Pure logic; deterministic; no I/O. Never fetches a model — keeps the
 * deploy pipeline fast and offline.
 */
import type { CategoryGuess } from './profile.ts';

type Category = Exclude<CategoryGuess['primary'], 'unknown'>;

const CATEGORY_KEYWORDS: Record<Category, readonly string[]> = {
  cooking: ['recipe', 'ingredient', 'cook', 'kitchen', 'meal', 'oven', 'tablespoon', 'teaspoon', 'cup', 'roast'],
  fitness: ['workout', 'exercise', 'reps', 'cardio', 'strength', 'training', 'pace', 'mileage', 'sets'],
  finance: ['budget', 'expense', 'income', 'invoice', 'transaction', 'currency', 'spending', 'category', 'savings'],
  journal: ['entry', 'mood', 'reflection', 'today', 'wrote', 'feeling', 'gratitude', 'noticed'],
  tools: ['converter', 'calculator', 'timer', 'utility', 'tool', 'convert', 'compute', 'measure'],
  media: ['video', 'photo', 'album', 'gallery', 'play', 'pause', 'stream', 'episode'],
  social: ['friend', 'follow', 'share', 'post', 'comment', 'reply', 'message', 'invite'],
  reference: ['definition', 'glossary', 'wiki', 'article', 'lookup', 'reference', 'index'],
};

const MIN_CONFIDENCE = 0.05;

export function classifyByText(visibleText: string): CategoryGuess {
  const lower = visibleText.toLowerCase();
  // Match the keyword plus optional plural 's' so 'recipes' counts as
  // 'recipe', 'ingredients' as 'ingredient', etc. Word-boundaries on
  // both sides prevent 'reference' from matching 'preferences'.
  const matches = (k: string) => new RegExp(`\\b${k}s?\\b`).test(lower);

  let best: CategoryGuess = { primary: 'unknown', confidence: 0, signals: [] };
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, readonly string[]]>) {
    const hits = keywords.filter(matches);
    const confidence = hits.length / keywords.length;
    if (confidence > best.confidence) {
      best = { primary: cat, confidence, signals: hits };
    }
  }

  if (best.confidence < MIN_CONFIDENCE) {
    return { primary: 'unknown', confidence: best.confidence, signals: best.signals };
  }
  return best;
}
