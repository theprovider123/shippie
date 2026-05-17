/**
 * Heuristic key-sentence extractor.
 *
 * When the on-device AI runtime isn't available (first load failed, the
 * showcase is running outside Shippie, or the user explicitly chose
 * fallback), we still want "Draft from brief" to do something useful.
 * This extractor scores sentences in the brief by:
 *
 *   1. Length — too-short and too-long sentences are penalised
 *   2. Keyword overlap with the section kind — a "budget" section
 *      pulls sentences mentioning costs, dollars, line items; a
 *      "timeline" section pulls sentences mentioning weeks, phases,
 *      delivery dates
 *   3. Position — earlier sentences get a small bonus (briefs are
 *      typically front-loaded)
 *
 * Returns the top-N sentences joined as a markdown bullet list. The
 * caller surfaces this as a draft starting point — the user always
 * edits before saving. We never claim this is AI output.
 */

import type { SectionKind } from './templates.ts';

/**
 * Per-section keyword bias. Lowercased, no special chars. The matcher
 * does substring scan against lowercased sentence text — so "budget"
 * matches "budgetary" and "$" matches any dollar amount.
 */
const KEYWORDS: Record<SectionKind, string[]> = {
  summary: ['overall', 'in short', 'in summary', 'overview', 'tldr', 'tl;dr'],
  problem: ['problem', 'gap', 'pain', 'challenge', 'broken', 'frustration', 'issue'],
  solution: ['solution', 'approach', 'method', 'plan', 'we will', 'we propose', 'strategy'],
  budget: ['$', '£', '€', 'cost', 'budget', 'price', 'pricing', 'spend', 'invest', 'fee'],
  timeline: ['week', 'month', 'quarter', 'phase', 'milestone', 'q1', 'q2', 'q3', 'q4', 'deadline', 'by '],
  team: ['team', 'we', 'staff', 'hire', 'our', 'experienced', 'led by', 'founder', 'years of'],
  impact: ['impact', 'outcome', 'result', 'change', 'improve', 'reduce', 'increase', 'metric', 'kpi'],
  references: ['research', 'study', 'paper', 'previously', 'prior', 'cited', 'source', 'see '],
  custom: [],
};

/** Split text into sentences. Keeps the trailing punctuation. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  // Split on sentence-ending punctuation followed by whitespace + capital
  // letter, OR on double newlines (paragraph breaks). The regex preserves
  // the punctuation in the previous sentence.
  const out: string[] = [];
  // First split on paragraph breaks.
  const paragraphs = trimmed.split(/\n\s*\n+/);
  for (const para of paragraphs) {
    const cleaned = para.replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) continue;
    // Then split on sentence boundaries.
    const parts = cleaned.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
    if (!parts) continue;
    for (const p of parts) {
      const s = p.trim();
      if (s.length > 0) out.push(s);
    }
  }
  return out;
}

/** Score a single sentence against a section kind. Higher = more relevant. */
export function scoreSentence(
  sentence: string,
  kind: SectionKind,
  positionFraction: number,
): number {
  const lower = sentence.toLowerCase();
  const len = sentence.length;
  // Length score — peak around 80-180 chars.
  let lenScore: number;
  if (len < 30) lenScore = -2;
  else if (len < 60) lenScore = 0.5;
  else if (len < 200) lenScore = 1;
  else if (len < 320) lenScore = 0.5;
  else lenScore = -1;

  // Keyword overlap.
  const keywords = KEYWORDS[kind];
  let kwScore = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) kwScore += 1;
  }

  // Position bonus — earlier sentences get a small bump.
  const posScore = Math.max(0, 0.5 - positionFraction * 0.5);

  return lenScore + kwScore * 1.5 + posScore;
}

export interface ExtractOptions {
  /** Section kind we're drafting for. Drives keyword bias. */
  kind: SectionKind;
  /** How many sentences to keep. Default 3. */
  topN?: number;
}

/**
 * Extract the top-N most relevant sentences from a brief. Returns a
 * markdown bullet list. Empty input returns an empty string (caller
 * decides what to do; the UI typically surfaces "your brief is empty").
 */
export function extractKeySentences(brief: string, opts: ExtractOptions): string {
  const sentences = splitSentences(brief);
  if (sentences.length === 0) return '';

  const topN = opts.topN ?? 3;
  const scored = sentences.map((s, i) => ({
    sentence: s,
    score: scoreSentence(s, opts.kind, i / Math.max(1, sentences.length - 1)),
    index: i,
  }));

  // Sort by score desc, ties broken by original order (stable).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  const picked = scored.slice(0, topN);
  // Restore original order so the bullets read naturally.
  picked.sort((a, b) => a.index - b.index);

  if (picked.length === 0) return '';

  return picked.map((p) => `- ${p.sentence}`).join('\n');
}
