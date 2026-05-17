/**
 * Local full-text search across transcripts.
 *
 * Whisper outputs ≤5 minutes of text per memo and the typical user
 * library is small (dozens to a few hundred memos). We don't need
 * SQLite FTS5; a tokenised substring scorer over the in-memory list
 * is fast enough and keeps the dependency footprint small.
 *
 * Scoring:
 *   - exact phrase match in transcript → highest
 *   - all query tokens present (any order) → next
 *   - any query token present → fallback
 *   - tag-matched memos receive a small boost
 *
 * Results are sorted by score desc, then by recorded_at desc.
 */

export interface SearchableMemo {
  id: string;
  transcript: string;
  tags: string[];
  recorded_at: string;
}

export interface SearchResult<T extends SearchableMemo = SearchableMemo> {
  memo: T;
  score: number;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\p{Diacritic}]/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function search<T extends SearchableMemo>(memos: readonly T[], query: string): SearchResult<T>[] {
  const trimmed = query.trim();
  if (!trimmed) {
    // No query — return everything in recency order with score 0.
    return [...memos]
      .sort((a, b) => recordedAtDesc(a, b))
      .map((memo) => ({ memo, score: 0 }));
  }
  const phrase = trimmed.toLowerCase();
  const queryTokens = tokenize(trimmed);
  const out: SearchResult<T>[] = [];
  for (const memo of memos) {
    const haystack = memo.transcript.toLowerCase();
    let score = 0;
    if (phrase.length > 0 && haystack.includes(phrase)) {
      score += 100;
    }
    if (queryTokens.length > 0) {
      const memoTokens = new Set(tokenize(memo.transcript));
      let matched = 0;
      for (const token of queryTokens) {
        if (memoTokens.has(token)) matched += 1;
      }
      if (matched === queryTokens.length) {
        score += 50;
      } else if (matched > 0) {
        score += 10 * matched;
      }
    }
    const tagSet = new Set(memo.tags.map((t) => t.toLowerCase()));
    for (const token of queryTokens) {
      if (tagSet.has(token)) score += 15;
    }
    if (score > 0) {
      out.push({ memo, score });
    }
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return recordedAtDesc(a.memo, b.memo);
  });
  return out;
}

function recordedAtDesc(a: SearchableMemo, b: SearchableMemo): number {
  return b.recorded_at.localeCompare(a.recorded_at);
}
