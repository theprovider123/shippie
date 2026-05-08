/**
 * Local-only data shapes for Read Later. Everything lives in
 * localStorage under STORAGE_KEY — no network, no sync.
 */

export interface Highlight {
  /** Stable id for cross-app references and key prop. */
  id: string;
  /** The article this highlight belongs to. */
  articleId: string;
  /** Verbatim snippet the user highlighted. */
  text: string;
  /** Optional note attached to the highlight. */
  note?: string;
  /** ISO timestamp the highlight was created. */
  createdAt: string;
}

export interface SavedArticle {
  id: string;
  url: string;
  title: string;
  /** Sanitised HTML (stripped of nav/footer/script). */
  contentHtml: string;
  /** Plain-text rendering of the article — used by search + summary fallback. */
  plainText: string;
  /** Read-time in minutes at 240 wpm. */
  readMinutes: number;
  /** Word count cached from extraction. */
  wordCount: number;
  /** ISO save timestamp. */
  savedAt: string;
  /** Marked as read (archived). */
  read?: boolean;
  /** Pinned to the top of the queue. */
  pinned?: boolean;
  /** Sort priority — lower numbers appear first within their pinned/unread bucket. */
  priority?: number;
  /** User-managed flat tags. */
  tags?: string[];
  /** Cached on-device summary (3 sentences) shown on the queue card. */
  summary?: {
    sentences: string[];
    /** Where the summary came from. AI = on-device transformer; extractive = heuristic. */
    source: 'ai' | 'extractive' | 'unavailable';
    generatedAt: string;
  };
  /** Reading progress 0..1 captured on scroll in the reader. */
  progress?: number;
}

export interface ReadLaterState {
  schemaVersion: 2;
  articles: SavedArticle[];
  highlights: Highlight[];
  /** When the user last archived an article — used by "this week" stats. */
  weekStartedAt?: string;
}

export const SCHEMA_VERSION = 2 as const;
