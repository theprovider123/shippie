/**
 * Local full-text search across the saved library.
 *
 * Substring scan over title + plainText + tags + highlight snippets.
 * Cheap and predictable up to 200 articles (our cap). If the user ever
 * needs more, the migration path is `@shippie/local-db` SQLite FTS5
 * — but until then the simpler thing is the right thing.
 *
 * Search is local-only — never goes to network.
 */
import type { Highlight, SavedArticle } from './types.ts';

export interface SearchResult {
  article: SavedArticle;
  /**
   * Highlighted snippet around the first match in the body. `null`
   * when the match was on title or tag only — the result still ranks.
   */
  snippet: string | null;
  /** Where the match landed — used by the UI to badge results. */
  matchedIn: 'title' | 'body' | 'tag' | 'highlight';
  /** Sort key — higher means earlier match / more relevant. */
  score: number;
}

const SNIPPET_RADIUS = 80;

export function search(
  query: string,
  articles: readonly SavedArticle[],
  highlights: readonly Highlight[] = [],
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const highlightsByArticle = new Map<string, Highlight[]>();
  for (const h of highlights) {
    const list = highlightsByArticle.get(h.articleId) ?? [];
    list.push(h);
    highlightsByArticle.set(h.articleId, list);
  }

  const results: SearchResult[] = [];
  for (const article of articles) {
    const titleHit = article.title.toLowerCase().indexOf(q);
    const bodyHit = (article.plainText ?? '').toLowerCase().indexOf(q);
    const tagHit = (article.tags ?? []).some((tag) => tag.toLowerCase().includes(q));
    const articleHighlights = highlightsByArticle.get(article.id) ?? [];
    const highlightHit = articleHighlights.findIndex((h) =>
      h.text.toLowerCase().includes(q) || (h.note?.toLowerCase().includes(q) ?? false),
    );

    if (titleHit >= 0) {
      results.push({
        article,
        snippet: null,
        matchedIn: 'title',
        // Title hits beat body hits — earlier title position scores higher.
        score: 1000 - titleHit,
      });
      continue;
    }
    if (highlightHit >= 0) {
      const h = articleHighlights[highlightHit]!;
      results.push({
        article,
        snippet: makeSnippet(h.text, q),
        matchedIn: 'highlight',
        score: 800,
      });
      continue;
    }
    if (bodyHit >= 0) {
      results.push({
        article,
        snippet: makeSnippet(article.plainText, q),
        matchedIn: 'body',
        score: 500 - Math.min(bodyHit, 500),
      });
      continue;
    }
    if (tagHit) {
      results.push({
        article,
        snippet: null,
        matchedIn: 'tag',
        score: 300,
      });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Cut a window around the first match for inline display. */
export function makeSnippet(text: string, query: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, SNIPPET_RADIUS * 2).trim();
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Search over the full library of highlights — used by the
 * "show me everything I highlighted about X" surface. Cross-app via
 * intent for downstream apps; this helper is the local view.
 */
export function searchHighlights(
  query: string,
  highlights: readonly Highlight[],
  articles: readonly SavedArticle[],
): Array<{ highlight: Highlight; article: SavedArticle | null }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  return highlights
    .filter((h) => h.text.toLowerCase().includes(q) || (h.note?.toLowerCase().includes(q) ?? false))
    .map((h) => ({ highlight: h, article: articleById.get(h.articleId) ?? null }));
}
