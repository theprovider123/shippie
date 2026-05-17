/**
 * localStorage-backed store for Read Later. Two-bucket migration from
 * the v1 array-of-articles shape to the v2 object that also carries
 * highlights and a week boundary. Every read tolerates missing /
 * malformed JSON without throwing — quota errors on write are
 * non-fatal.
 */
import type { ReadLaterState, SavedArticle, Highlight } from './types.ts';
import { SCHEMA_VERSION } from './types.ts';

export const STORAGE_KEY = 'shippie.read-later.v1';
export const MAX_ARTICLES = 200;

function emptyState(): ReadLaterState {
  return {
    schemaVersion: SCHEMA_VERSION,
    articles: [],
    highlights: [],
  };
}

function isLegacyV1(value: unknown): value is SavedArticle[] {
  return Array.isArray(value);
}

export function load(): ReadLaterState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (isLegacyV1(parsed)) {
      // v1: `SavedArticle[]`. Migrate by wrapping. Old entries didn't
      // carry `plainText`/`wordCount`, so backfill those from contentHtml
      // length so search keeps working until the user re-saves.
      return {
        schemaVersion: SCHEMA_VERSION,
        articles: parsed.slice(0, MAX_ARTICLES).map(backfill),
        highlights: [],
      };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Partial<ReadLaterState>;
      return {
        schemaVersion: SCHEMA_VERSION,
        articles: Array.isArray(obj.articles)
          ? obj.articles.slice(0, MAX_ARTICLES).map(backfill)
          : [],
        highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
        weekStartedAt: obj.weekStartedAt,
      };
    }
    return emptyState();
  } catch {
    return emptyState();
  }
}

function backfill(article: SavedArticle): SavedArticle {
  if (article.plainText && typeof article.wordCount === 'number') return article;
  // Strip tags by parsing the HTML in a detached parser. Fall back to
  // the html itself if a parser isn't available (test envs without
  // DOMParser shouldn't hit this path because v2 already populates it).
  let text = article.plainText ?? '';
  if (!text && typeof DOMParser !== 'undefined') {
    try {
      const tmp = new DOMParser().parseFromString(article.contentHtml ?? '', 'text/html');
      text = (tmp.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    } catch {
      text = '';
    }
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    ...article,
    plainText: text,
    wordCount: words,
  };
}

export function save(state: ReadLaterState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota errors non-fatal */
  }
}

export function newArticleId(now: number = Date.now()): string {
  return `a_${now}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newHighlightId(now: number = Date.now()): string {
  return `h_${now}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function highlightsFor(state: ReadLaterState, articleId: string): Highlight[] {
  return state.highlights.filter((h) => h.articleId === articleId);
}

/** Compute "saved this week" / "read this week" for honest queue stats. */
export function weekStats(state: ReadLaterState, now: Date = new Date()): {
  savedThisWeek: number;
  readThisWeek: number;
  unread: number;
  total: number;
} {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  let savedThisWeek = 0;
  let readThisWeek = 0;
  let unread = 0;
  for (const a of state.articles) {
    const savedAt = Date.parse(a.savedAt);
    if (Number.isFinite(savedAt) && savedAt >= weekAgo) savedThisWeek++;
    if (a.read && Number.isFinite(savedAt) && savedAt >= weekAgo) readThisWeek++;
    if (!a.read) unread++;
  }
  return { savedThisWeek, readThisWeek, unread, total: state.articles.length };
}

/**
 * Sort: pinned first, then unread by priority + saved-at desc, then
 * archived. The priority field is set by the drag-to-reorder UI; if
 * absent, fall back to saved-at so newest still wins.
 */
export function sortQueue(articles: readonly SavedArticle[]): SavedArticle[] {
  return [...articles].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (!!a.read !== !!b.read) return a.read ? 1 : -1;
    const pa = a.priority ?? Number.POSITIVE_INFINITY;
    const pb = b.priority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return Date.parse(b.savedAt) - Date.parse(a.savedAt);
  });
}
